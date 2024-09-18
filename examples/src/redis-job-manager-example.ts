import { Hamok, HamokMap, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';
import { createConcurrentExecutor } from './utils/ConcurrentExecutor';

const logger = pino.pino({
	name: 'redis-job-executing-example',
	level: 'debug',
});;

type Job = {
	id: string;
	state: 'pending' | 'running' | 'stopped' ;
	allocatedTo?: string;
	result?: unknown;
	error?: string;
	note?: string,
}
type AppData = {
	name: string,
	start: (job: Job) => void,
	stop: (jobId: string) => void,
	runningJobIds: Set<string>,
}

const publisher = new Redis();
const subscriber = new Redis();
const servers = new Map<string, Hamok<AppData>>();
const startJob = (job: Job) => [...servers.values()].find(server => server.appData.start)?.appData.start(job);
const endJob = (jobId: string) => [...servers.values()].find(server => server.appData.stop)?.appData.stop(jobId);

export async function run() {
	await subscriber.subscribe('hamok-channel', (err, count) => {
		if (err) {
			logger.error('Failed to subscribe: %s', err.message);
		}
	});

	for (let serverNum = 0; serverNum < 5; serverNum++) {
		const serverName = `server_${serverNum}`
		servers.set(serverName, createServer(serverName));
	}

	await Promise.all([...servers.values()].map(server => server.join()));

	for (let i = 0; i < 20; i++) {
		const jobId = `job_${i}`;
		logger.info('Creating job with id "%s"', jobId);
		startJob({
			id: jobId,
			state: 'pending',
		});
		setTimeout(() => {
			endJob(jobId);
		}, 10000);
	}
}

function createServer(name: string, joined?: () => void) {
	const hamok = new Hamok<AppData>({
		appData: {
			name,
			runningJobIds: new Set(),
			start: () => void 0,
			stop: () => void 0,
		}
	});

	const jobs = hamok.createMap<string, Job>({	
		mapId: 'jobs',
	});
	const executor = createConcurrentExecutor(1);
	const startJob = async (job: Job): Promise<void> => {
		if (job.allocatedTo !== hamok.localPeerId) return;
		if (job.state !== 'pending') return;
		try {
			const startedJob: Job = {
				...job,
				state: 'running',
			};
			const started = await jobs.updateIf(job.id, startedJob, job);
	
			if (!started) {
				return logger.warn('%s tried to start job "%s", but it was failed, becasue the job entry changed', hamok.appData.name, job.id);
			}
			// here it comes anything related to start the job

			hamok.appData.runningJobIds.add(job.id);

			logger.info('%s started job "%s".', hamok.appData.name, job.id);
		} catch (err) {
			logger.error(`Failed to handle job on ${hamok.appData.name} "${job.id}": ${err}`);
		}
	}
	const stopJob = async (jobId: string): Promise<void> => {
		// all of the stuff related to stopping the job
		if (hamok.appData.runningJobIds.delete(jobId)) {
			logger.info('%s stopped job "%s".', hamok.appData.name, jobId);
		}
	}
	const scheduleJob = async (job: Job): Promise<void> => {
		if (job.allocatedTo || job.state !== 'pending') return;

		executor(async () => {
			const serverLoads = new Map<string, number>([...hamok.remotePeerIds, hamok.localPeerId].map(peerId => [peerId, 0]));
			for (const [, runningJob] of jobs) {
				if (!runningJob.allocatedTo) continue;
	
				serverLoads.set(runningJob.allocatedTo, (serverLoads.get(runningJob.allocatedTo) ?? 0) + 1);
			}
	
			logger.info('Server loads: %s', [ ...serverLoads ].map(([peerId, load]) => `${peerId}: ${load}`).join(', '));
	
			const smallestLoadedPeerId = [ ...serverLoads.entries() ].sort((a, b) => a[1] - b[1])[0]?.[0];
	
			const allocatedJob = {
				...job,
				allocatedTo: smallestLoadedPeerId,
			};
	
			const allocated = await jobs.updateIf(job.id, allocatedJob, job);
			if (!allocated) {
				logger.warn('%s tried to allocate job "%s" to "%s", but it was failed, because the job entry changed', hamok.appData.name, job.id, smallestLoadedPeerId);
			} else {
				logger.info('%s allocated job "%s" to "%s".', hamok.appData.name, job.id, smallestLoadedPeerId);
			}
		})
	}
	const rescheduleJob = async (job: Job): Promise<void> => {
		const rescheduledJob: Job = {
			...job,
			state: 'pending',
			allocatedTo: undefined,
			result: undefined,
			error: undefined,
			note: job.note + ', rescheduled'
		};
		try {
			const rescheduled = await jobs.updateIf(job.id, rescheduledJob, job);
	
			if (!rescheduled) {
				logger.warn('%s tried to rescheduled job "%s", but it was failed.', hamok.appData.name, job.id);
			} else {
				logger.info('%s rescheduled job "%s".', hamok.appData.name, job.id);
			}
		} catch (err) {
			logger.error(`Failed to reschedule job "${job.id}": ${err}`);
		}
	}
	const rescheduleDeadPeersJob = async () => {
		for (const [ , job ] of jobs) {
			if (job.state !== 'running') continue;
			if (hamok.remotePeerIds.has(job.allocatedTo ?? '')) continue;
			
			await rescheduleJob(job);
		}
	}
	const leaderOnInsert = (jobId: string, job: Job) => scheduleJob(job).catch(() => void 0);
	const leaderOnUpdate = (jobId: string, oldValue: Job, newValue: Job) => scheduleJob(newValue).catch(() => void 0);
	const leaderOnRemotePeerLeft = async (remotePeerId: string) => rescheduleDeadPeersJob().catch(() => void 0);

	hamok.on('follower', () => {
		jobs.off('insert', leaderOnInsert);
		jobs.off('update', leaderOnUpdate);
		hamok.off('remote-peer-left', leaderOnRemotePeerLeft);
	})

	hamok.on('leader', async () => {
		logger.debug('%s is now the leader, will check if there are running jobs belongs to a "dead" instance.', hamok.appData.name);
		for (const [ , job ] of jobs) {
			if (job.state !== 'pending' || job.allocatedTo) continue;

			await scheduleJob(job);
		}
		await rescheduleDeadPeersJob();

		jobs.on('insert', leaderOnInsert);
		jobs.on('update', leaderOnUpdate);
		hamok.on('remote-peer-left', leaderOnRemotePeerLeft);

		// now we reschedule jobs that are running but the server is dead

		for (const [ , job ] of jobs) {
			if (job.state !== 'running') continue;
			if (hamok.remotePeerIds.has(job.allocatedTo ?? '')) continue;
			
			await rescheduleJob(job);
		}
	});

	jobs.on('update', (jobId, oldValue, newValue) => startJob(newValue).catch(() => void 0));
	jobs.on('remove', (jobId) => stopJob(jobId).catch(() => void 0));

	hamok.appData.start = (job: Job) => {
		logger.info('%s received request to start job "%s"', hamok.appData.name, job.id);

		jobs.insert(job.id, job).catch(() => void 0).then(alreadyInserted => {
			if (alreadyInserted) {
				logger.warn('%s tried to start job "%s", but it was failed, because the job entry changed', hamok.appData.name, job.id);
			}
		}).catch(err => {
			logger.error(`Failed to start job "${job.id}": ${err}`);
		});
	};
	hamok.appData.stop = (jobId: string) => {
		logger.info('%s received request to stop job "%s"', hamok.appData.name, jobId);
		jobs.delete(jobId).catch(() => void 0).then(deleted => {
			if (!deleted) {
				logger.warn('%s tried to stop job "%s", but it was failed, because the job entry changed', hamok.appData.name, jobId);
			}
		});
	};

	subscriber.on('messageBuffer', (channel, buffer) => {
		hamok.accept(HamokMessage.fromBinary(buffer));
	});
	hamok.on('message', (message) => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));

	logger.info('%s created.', hamok.appData.name);

	return hamok;
}

process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

