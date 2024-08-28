import { Hamok, HamokMap, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'redis-job-executing-example',
	level: 'debug',
});;

type Job = {
	id: string;
	state: 'pending' | 'running' | 'completed' | 'failed';
	startedBy?: string;
	startedAt?: number;
	endedAt?: number;
	result?: unknown;
	error?: string;
	note?: string,
}
type AppData = {
	busy: boolean,
	name: string,
	jobs?: HamokMap<string, Job>,
}

const publisher = new Redis();
const subscriber = new Redis();


export async function run() {
	const server_1 = new Hamok<AppData>({
		appData: {
			busy: false,
			name: 'server_1',
		}
	});
	const server_2 = new Hamok<AppData>({
		appData: {
			busy: false,
			name: 'server_2',
		}
	});
	const server_3 = new Hamok<AppData>({
		appData: {
			busy: false,
			name: 'server_3',
		}
	});
	await subscriber.subscribe('hamok-channel', (err, count) => {
		if (err) {
			logger.error('Failed to subscribe: %s', err.message);
		}
	});
	subscriber.on('messageBuffer', (channel, buffer) => {
		server_1.accept(HamokMessage.fromBinary(buffer));
		server_2.accept(HamokMessage.fromBinary(buffer));
		server_3.accept(HamokMessage.fromBinary(buffer));
	});
	server_1.on('message', (message) => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_2.on('message', (message) => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_3.on('message', (message) => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	
	initialize(server_1);
	initialize(server_2);
	initialize(server_3);

	await Promise.all([
		server_1.join(),
		server_2.join(),
		server_3.join(),
	]);

	const servers = [ server_1, server_2, server_3 ];
	let jobId = 0;
	const timer = setInterval(async () => {
		const job: Job = {
			id: 'job-' + jobId++,
			state: 'pending',
		};
		try {
			const server = servers.find(server => server.run);
			await server?.appData.jobs?.insert(job.id, job);
		} catch (err) {
			logger.error('Failed to insert job "%s" into server_1: %s', job.id, err);
		}

		if (jobId % 23 === 0) {
			const victim = servers[Math.floor(Math.random() * servers.length)];
			logger.info('%s is leaving', victim.appData.name);

			try {
				await victim.leave();
			} catch (err) {
				logger.error('Failed to kill %s: %s', victim.appData.name, err);
			}

			setTimeout(() => {
				logger.info('%s is rejoining', victim.appData.name);
				victim.join().catch(err => logger.warn('Failed', err));
			}, 10000);
		}
	}, 1000);

	setTimeout(() => {
		clearInterval(timer);
		server_1.close();
		server_2.close();
		server_3.close();
	}, 90000);
	
}

async function executeJob(job: Job): Promise<Job> {
	return new Promise(resolve => setTimeout(() => {
		const endedJob: Job = {
			...job,
			state: 'completed',
			endedAt: Date.now(),
		};

		resolve(endedJob);
	}, 1000 + Math.floor(Math.random() * 1000)));


}

function initialize(hamok: Hamok<AppData>) {
	const jobs = hamok.createMap<string, Job>({	
		mapId: 'jobs',
	});
	const seekNextJob = () => {
		for (const [ , job ] of jobs) {
			if (job.state === 'pending') return job;
		}
	}
	const pickJob = async (scheduledJob: Job): Promise<void> => {
		if (scheduledJob.state !== 'pending') return;
		if (hamok.appData.busy) return;

		hamok.appData.busy = true;
		try {
			// logger.info(`${hamok.appData.name} trying to pickup job "${scheduledJob.id}".`);

			const startedJob: Job = {
				...scheduledJob,
				state: 'running',
				startedAt: Date.now(),
				startedBy: hamok.appData.name,
			};
			const started = await jobs.updateIf(scheduledJob.id, startedJob, scheduledJob);
	
			if (started) {
				logger.info(`${hamok.appData.name} starting job "${scheduledJob.id}".`);

				await jobs.set(scheduledJob.id, await executeJob(startedJob));

				logger.info(`${hamok.appData.name} executed job: %s.`, scheduledJob.id);
			}
		} catch (err) {
			logger.error(`Failed to start job "${scheduledJob.id}": ${err}`);
		} finally {
			hamok.appData.busy = false;
		}
	};
	const scheduleJob = async (job: Job): Promise<void> => {
		try {
			switch (job.state) {
				case 'pending':
					return await pickJob(job);
				case 'completed':
				case 'failed': {
					const nextJob = seekNextJob();
					if (nextJob) {
						return await pickJob(nextJob);
					}
				}
			}
		} catch (err) {
			logger.error(`Failed to schedule job "${job.id}": ${err}`);
		}
		
	};
	const rescheduleJob = async (job: Job): Promise<void> => {
		const rescheduledJob: Job = {
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

	hamok.on('leader', async () => {
		logger.debug('%s is now the leader, will check if there are running jobs belongs to a "dead" instance.', hamok.appData.name);
		const reschedules: Promise<void>[] = [];

		for (const [ , job ] of jobs) {
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

		for (const [ , job ] of jobs) {
			if (job.state !== 'running') continue;
			if (job.startedBy !== remotePeerId) continue;

			reschedules.push(rescheduleJob(job));
		}

		if (0 < reschedules.length) await Promise.allSettled(reschedules);
	});
	hamok.on('joined', () => {
		logger.info('%s joined the grid, listing available jobs.', hamok.appData.name);
		for (const [ , job ] of jobs) {
			logger.info(`${hamok.appData.name} listing: Job "${job.id}" is in state "${job.state}", started by ${job.startedBy}. Note: ${job.note}`);
		}
	});

	jobs.on('insert', (jobId, job) => scheduleJob(job).catch(() => void 0));
	jobs.on('update', (jobId, oldValue, newValue) => scheduleJob(newValue).catch(() => void 0));

	hamok.appData.jobs = jobs;

	logger.info('%s initialized.', hamok.appData.name);
}

process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

