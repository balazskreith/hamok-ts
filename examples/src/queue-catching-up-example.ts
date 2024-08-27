import { Hamok, HamokConfig, HamokQueue, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'common-import-export-example',
	level: 'debug',
});

const hamokConfig: Partial<HamokConfig> = {
	logEntriesExpirationTimeInMs: 5000,
}

export async function run() {
	const server_1 = new Hamok({ ...hamokConfig, onlyFollower: true });
	const server_2 = new Hamok(hamokConfig);
	const server_3 = new Hamok(hamokConfig);
	const messageHub = new HamokMessageHub();
	
	logger.info('Starting server 1 %s', server_1.localPeerId);
	logger.info('Starting server 2 %s', server_2.localPeerId);

	messageHub.add(server_1, server_2);

	// server_3.on('commit', (commitIndex) => logger.debug('Server_3 committed at index %d', commitIndex));

	// verify that the entries are indeed removed from the logs
	// server_1.raft.logs.on('removed', (commitIndex) => logger.debug('Server_1 Removed log entry at index %d', commitIndex));
	// server_2.raft.logs.on('removed', (commitIndex) => logger.debug('Server_2 Removed log entry at index %d', commitIndex));

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	const queue_1 = server_1.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	let queue_2: HamokQueue<number> | undefined;

	// const startedPushingAt = Date.now();
	const intervalInMs = 100;
	const lastItem = 200;
	// const intervalInMs = 30;
	const pushingToQueue1Timer = (() => {
		let item = -1;
		return setInterval(
			async () => {
				const thisItem = ++item;

				const queue = queue_2 ?? queue_1;
				await queue.push(thisItem);

				// logger.debug(' ----> Pushed %d to %s', thisItem, queue_2 ? 'queue_2' : 'queue_1');

				if (lastItem < thisItem) {
					clearInterval(pushingToQueue1Timer);
					logger.info('Stop producing')
				}
				
			}, 
			intervalInMs
		);
	})();

	await new Promise<void>(resolve => setTimeout(resolve, 7000));

	logger.info('Starting server 3 %s', server_3.localPeerId);

	messageHub.add(server_3);
	await server_3.join();

	const queue_3 = server_3.createQueue<number>({
		queueId: 'my-distributed-queue',
	});

	// queue_3.on('add', value => logger.info('Queue_3 added %d', value));
	// queue_3.on('remove', value => logger.info('Queue_3 removed %d', value));

	await queue_3.initializing;

	logger.info('Server 3 joined the cluster, creating queue_2');

	queue_2 = await server_2.createQueue<number>({
		queueId: 'my-distributed-queue',
	}).initializing;

	logger.info('Server 3 joined the cluster');

	let expected = 0;
	
	while(!queue_3?.empty) {
		const queue = expected % 2 === 0 ? queue_1 : queue_3;
		const actual = await queue.pop();
		if (actual !== expected) {
			logger.error('Expected %d but got %d', expected, actual);
			if (actual !== undefined)
				expected = actual;
		} else {
			expected++;
		}

		logger.info('Got %d from %s', actual, expected % 2 === 0 ? 'queue_1' : 'queue_3');
	}

	server_1.close();
	server_2.close();
	server_3.close();
}

if (require.main === module) {
	logger.info('Running from a module file');
	setHamokLogLevel('info');
	run();
}
