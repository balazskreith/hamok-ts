import { Hamok, HamokMessage, setHamokLogLevel } from 'hamok';
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
}
type AppData = {
	picking: boolean;
	ongoingJob: null | string;
	seekNextJob(): Job | undefined;
	pickJob(newJob: Job): Promise<void>;
}
const server_1 = new Hamok<{ ongoingJob: null | string }>({
	appData: {
		ongoingJob: null,
	}
});
const server_2 = new Hamok<{ ongoingJob: null | string }>({
	appData: {
		ongoingJob: null,
	}
});
const publisher = new Redis();
const subscriber = new Redis();
const jobs_1 = server_1.createMap<string, Job>({
	mapId: 'jobs',
});
const jobs_2 = server_2.createMap<string, Job>({
	mapId: 'jobs',
});

let ongoingJob: Job | null = null;

function seekNextJob(): Job | undefined {
	logger.info('Seeking next job to start.');
	for (const [ , job ] of jobs) {
		if (job.state === 'pending') return job;
	}
}

async function pickJob(scheduledJob: Job): Promise<void> {
	if (ongoingJob) return;
	if (scheduledJob.state !== 'pending') return;

	logger.info(`Picking job "${scheduledJob.id}".`);

	const startedJob: Job = {
		...scheduledJob,
		state: 'running',
		startedAt: Date.now(),
		startedBy: hamok.localPeerId,
	};
	const started = await jobs.updateIf(scheduledJob.id, startedJob, scheduledJob);

	if (!started) {
		logger.info(`Job "${scheduledJob.id}" has been already started, we will not start it again.`);
		const nextJob = seekNextJob();

		if (nextJob) {
			logger.info(`Found next job "${nextJob.id}" to start.`);
			await pickJob(nextJob);
		} else {
			logger.info('No more jobs to start.');
		}
		
		return;
	}

	ongoingJob = scheduledJob;
	const executionTime = 20000 + Math.floor(Math.random() * 20000);

	logger.log(`Starting job "${scheduledJob.id}" with execution time of ${executionTime}ms.`);
	setTimeout(async () => {
		ongoingJob = null;
		try {
			const endedJob: Job = {
				...startedJob,
				state: 'completed',
			};
			const ended = await jobs.updateIf(scheduledJob.id, endedJob, startedJob);

			// await jobs.delete(scheduledJob.id);

			if (!ended) {
				return logger.log(`Job "${scheduledJob.id}" has been canceled.`);
			}
            
			logger.log(`Job "${scheduledJob.id}" has been completed.`);
		} catch (err) {
			return logger.error(`Failed to update job "${scheduledJob.id}": ${err}`);
		}

		const nextJob = seekNextJob();

		if (nextJob) {
			logger.info(`Found next job "${nextJob.id}" to start.`);
			await pickJob(nextJob);
		} else {
			logger.info('No more jobs to start.');
		}
	}, executionTime);
}

async function rescheduleJob(job: Job): Promise<void> {
	const rescheduledJob: Job = {
		...job,
		state: 'pending',
		startedBy: undefined,
		startedAt: undefined,
		endedAt: undefined,
		result: undefined,
		error: undefined,
	};

	const rescheduled = await jobs.updateIf(job.id, rescheduledJob, job);

	if (!rescheduled) {
		logger.warn(`Job "${job.id}" has been not rescheduled.`);
	} else {
		logger.log(`Job "${job.id}" has been rescheduled.`);
	}
}

async function start() {
	setHamokLogLevel('warn');
	const executor = new ConcurrentExecutor(1);

	hamok.on('leader', async () => {
		logger.log('This instance is now the leader, will check if there are running jobs belongs to a "dead" instance.');
		const reschedules: Promise<void>[] = [];

		for (const [ , job ] of jobs) {
			if (job.state !== 'running') continue;
			if (hamok.remotePeerIds.has(job.startedBy ?? '')) continue;
			
			reschedules.push(rescheduleJob(job));
		}

		if (0 < reschedules.length) await Promise.all(reschedules);
	});
	hamok.on('remote-peer-left', async (remotePeerId: string) => {
		if (!hamok.leader) return;
		logger.info(`Remote peer "${remotePeerId}" has left and this instance is the leader, will reschedule the job assigned to the dead peer.`);

		const reschedules: Promise<void>[] = [];

		for (const [ , job ] of jobs) {
			if (job.state !== 'running') continue;
			if (job.startedBy !== remotePeerId) continue;

			reschedules.push(rescheduleJob(job));
		}

		if (0 < reschedules.length) await Promise.all(reschedules);
	});
	jobs.on('insert', (jobId, job) => executor.execute(() => pickJob(job).catch(() => void 0)));
	jobs.on('update', (jobId, oldValue, newValue) => executor.execute(() => pickJob(newValue).catch(() => void 0)));
	
	subscriber.subscribe('hamok-channel', (err, count) => {
		if (err) {
			logger.error('Failed to subscribe: %s', err.message);
		}
		logger.log(`Subscribed to hamok-channel. This client is currently subscribed to ${count} channels.`);
	});
	subscriber.on('messageBuffer', (channel, buffer) => {
		hamok.accept(HamokMessage.fromBinary(buffer));
	});
	hamok.on('message', (message) => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));

	await hamok.join();

	if (process.argv.includes('--add-jobs')) {
		setInterval(async () => {
			const job: Job = {
				id: Math.random().toString(36),
				state: 'pending',
			};

			logger.info(`Scheduling job "${job.id}".`);

			const existingJob = await jobs.insert(job.id, job);

			if (existingJob) {
				logger.warn(`Job "${job.id}" has been already scheduled.`);
			}

		}, 10000);

		setInterval(() => {
			logger.info('Listing actual jobs');
			for (const [ , actualJob ] of jobs) {
				if (actualJob.state !== 'pending' && actualJob.state !== 'running') continue;

				logger.info(`Job "${actualJob.id}" is in state "${actualJob.state}", started by ${actualJob.startedBy}.`);
			}
		}, 5000);
	}

	logger.info('Started the application, local peer id is %s.', hamok.localPeerId);
}

function stop() {
	hamok.stop();
	publisher.disconnect();
	subscriber.disconnect();
	process.exit(0);
}

process.on('SiGINT', stop);

start().catch(stop);