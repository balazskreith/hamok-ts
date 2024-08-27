import { Hamok, HamokMap, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';
import { createConcurrentExecutor } from './utils/ConcurrentExecutor';

const logger = pino.pino({
	name: 'redis-job-executing-example',
	level: 'debug',
});;

type RecordingJob = {
	id: string;
	state: 'pending' | 'running';
	startedBy?: string;
	startedAt?: number;
	endedAt?: number;
	result?: unknown;
	error?: string;
	note?: string,
}
type AppData = {
	name: string,
	actualRecording?: string,
	start?: (recordingJob: RecordingJob) => Promise<{ inserted: boolean, started: boolean }>;
	stop?: (jobId: string) => Promise<void>;
}
// we assign it to somewhere...
const publisher = new Redis();
const subscriber = new Redis();
const servers = new Map<string, Hamok<AppData>>();
const pickServerToStart = () => [...servers.values()].find(server => server.appData.start)?.appData.start;
const pickServerToStop = () => [...servers.values()].find(server => server.appData.stop)?.appData.stop;

async function main() {
	
	await subscriber.subscribe('hamok-channel', (err, count) => {
		if (err) {
			logger.error('Failed to subscribe: %s', err.message);
		}
	});

	let num = 0;
	addServer(`server_${++num}`);
	addServer(`server_${++num}`);

	for (let i = 0; i < 20; i++) {
		const start = pickServerToStart();
		if (!start) {
			logger.error('There is no server to accept the job');
			break;
		}
		logger.info('Creating recording job');
		for (let run = true; run;) {
			const jobId = `job_${i}`;
			const { started: startedNow} = (await start({
				id: jobId,
				state: 'pending',
			}));
			
			if (!startedNow) {
				await new Promise<void>(resolve => addServer(`server_${++num}`, resolve))
				continue;
			}
			setTimeout(() => {
				const stop = pickServerToStop();
				if (!stop) {
					logger.error('There is no server to stop the job');
					return;
				}
				logger.info('Stopping recording job');
				stop(jobId).catch(err => logger.error('Failed to stop recording job: %s', err));	
			}, 20000)
			run = false;
		}
	}
	
}


function addServer(name: string, done?: () => void): void{
	const hamok = new Hamok<AppData>({
		appData: {
			name,
		}
	});
	const executor = createConcurrentExecutor(1);
	const recordings = hamok.createMap<string, RecordingJob>({	
		mapId: 'recordings',
	});
	const recordingChanged = async (job: RecordingJob): Promise<void> => {
		if (hamok.appData.actualRecording) {
			// we already have a recoding and this is not the one
			if (job.id !== hamok.appData.actualRecording) return;
		}

		try {
			switch (job.state) {
				case 'pending': {
					if (hamok.appData.actualRecording) {
						if (job.id === hamok.appData.actualRecording) {
							logger.warn('%s is already recording "%s", but the recording is rescheduled. We stop this recording here.', hamok.appData.name, job.id);
							hamok.appData.actualRecording = undefined;
						}
						break;
					}

					logger.info('%s trying to pickup recording "%s"', hamok.appData.name, job.id);
					const started = await recordings.updateIf(job.id, { ...job, state: 'running', startedBy: hamok.localPeerId, startedAt: Date.now() }, job);

					if (started) {
						logger.info('%s picked up recording "%s"', hamok.appData.name, job.id);
						hamok.appData.actualRecording = job.id;
					}
					break;
				}
			}
		} catch (err) {
			logger.error(`Failed to schedule job "${job.id}": ${err}`);
		}
	};
	const stopRecording = async (job: RecordingJob): Promise<void> => {
		if (job.state !== 'running') return;
		if (hamok.appData.actualRecording !== job.id) return;

		logger.info('%s stopped recording "%s"', hamok.appData.name, job.id);
		hamok.appData.actualRecording = undefined;

		for (const [ , job ] of recordings) {
			if (job.state !== 'pending') continue;

			executor(() => recordingChanged(job)).catch(() => void 0);
		}
	}
	const rescheduleJob = async (job: RecordingJob): Promise<void> => {
		const rescheduledJob: RecordingJob = {
			...job,
			state: 'pending',
			startedBy: undefined,
			startedAt: undefined,
			endedAt: undefined,
			result: undefined,
			error: undefined,
			note: job.note + ', rescheduled'
		};
		try {
			const rescheduled = await recordings.updateIf(job.id, rescheduledJob, job);
	
			if (!rescheduled) {
				logger.warn('%s tried to rescheduled job "%s", but it was failed.', hamok.appData.name, job.id);
			} else {
				logger.info('%s rescheduled job "%s".', hamok.appData.name, job.id);
			}
		} catch (err) {
			logger.error(`Failed to reschedule job "${job.id}": ${err}`);
		}
		
	}

	hamok.on('leader', async () => {
		logger.debug('%s is now the leader, will check if there are running jobs belongs to a "dead" instance.', hamok.appData.name);
		const reschedules: Promise<void>[] = [];

		for (const [ , job ] of recordings) {
			if (job.state !== 'running') continue;
			if (hamok.remotePeerIds.has(job.startedBy ?? '')) continue;
			
			reschedules.push(rescheduleJob(job));
		}

		if (0 < reschedules.length) await Promise.allSettled(reschedules);
	});
	hamok.on('remote-peer-left', async (remotePeerId: string) => {
		if (!hamok.leader) return;
		logger.info(`%s detected that remote peer "${remotePeerId}" has left and this instance is the leader, will reschedule the job assigned to the dead peer.`, hamok.appData.name);

		const reschedules: Promise<void>[] = [];

		for (const [ , job ] of recordings) {
			if (job.state !== 'running') continue;
			if (job.startedBy !== remotePeerId) continue;

			reschedules.push(rescheduleJob(job));
		}

		if (0 < reschedules.length) await Promise.allSettled(reschedules);
	});
	hamok.on('joined', () => {
		logger.info('%s joined the grid, trying to pickup a pending recording.', hamok.appData.name);
		for (const [ , job ] of recordings) {
			if (job.state !== 'pending') continue;

			executor(() => recordingChanged(job)).catch(() => void 0);
		}
	});

	const idleThreshold  = 10000 + Math.floor(Math.random() * 10000);
	let idleStarted: number | undefined;

	hamok.on('heartbeat', () => {
		if (hamok.appData.actualRecording) {
			idleStarted = undefined;
			return;
		} else if (idleStarted === undefined) {
			idleStarted = Date.now();
			return;
		}

		if (hamok.remotePeerIds.size < 3) {
			// we cannot close any server if there are less than 3 servers
			return;
		} else if (hamok.leader) {
			return; // let's not close the leader
		}
		
		if (idleThreshold < Date.now() - idleStarted) {
			logger.info('%s is idle for %d ms, closing server.', hamok.appData.name, idleThreshold);
			
			hamok.close();
		}
	});

	hamok.appData.start = (recordingJob: RecordingJob) => {
		return new Promise<{ inserted: boolean, started: boolean }>((resolve) => {
			let inserted = false;
			setTimeout(() => {
				resolve({ inserted, started: recordings.get(recordingJob.id)?.state === 'running' });
			}, 5000);
			recordings.insert(recordingJob.id, recordingJob)
				.then(reply => {
					inserted = reply === undefined;
				})
				.catch(err => logger.error('Failed to insert recording "%s": %s', recordingJob.id, err));
		});
	};
	hamok.appData.stop = async (jobId: string) => {
		return recordings.delete(jobId).then(() => void 0);
	}
	hamok.once('close', () => {
		servers.delete(hamok.localPeerId);
		hamok.appData.start = undefined;
		hamok.appData.stop = undefined;
	});
	servers.set(hamok.localPeerId, hamok);

	recordings.on('insert', (jobId, job) => executor(() => recordingChanged(job)).catch(() => void 0));
	recordings.on('update', (jobId, oldValue, newValue) => executor(() => recordingChanged(newValue)).catch(() => void 0));
	recordings.on('remove', (jobId, job) => executor(() => stopRecording(job)).catch(() => void 0));
	
	subscriber.on('messageBuffer', (channel, buffer) => {
		hamok.accept(HamokMessage.fromBinary(buffer));
	});
	hamok.on('message', (message) => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));

	hamok.join().then(() => {
		logger.info('%s initialized.', hamok.appData.name);
		done?.();
	});

	logger.info('Server %s is started.', hamok.appData.name);
}

process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	main();
}

