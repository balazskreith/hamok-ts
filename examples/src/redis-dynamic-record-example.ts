import { Hamok, HamokConfig, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'record-insert-get-example',
	level: 'debug',
});
const publisher = new Redis();
const subscriber = new Redis();

type MySharedConfig = {
	foo: string;
	bar: number;
	something?: number,
}

const hamokConfig: Partial<HamokConfig> = {
	// we have 5s of expiration for logs, so snapshots are really matters
	logEntriesExpirationTimeInMs: 5000,
}

export async function run() {
	const server_1 = new Hamok(hamokConfig);
	const server_2 = new Hamok(hamokConfig);
	const server_3 = new Hamok(hamokConfig);
	
	await subscriber.subscribe('hamok-channel');

	subscriber.on('messageBuffer', (channel, buffer) => {
		server_1.accept(HamokMessage.fromBinary(buffer));
		server_2.accept(HamokMessage.fromBinary(buffer));
		server_3.accept(HamokMessage.fromBinary(buffer));
	});

	server_1.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_2.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_3.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));

	server_1.raft.logs.on('removed', (commitIndex) => {
		logger.warn('Server_1 Removed log entry at index %d', commitIndex);
	});
	server_2.raft.logs.on('removed', (commitIndex) => {
		logger.warn('Server_2 Removed log entry at index %d', commitIndex);
	});
	server_3.raft.logs.on('removed', (commitIndex) => {
		logger.warn('Server_3 Removed log entry at index %d', commitIndex);
	});

	logger.info('Creating a record on server_1 and initializing it with { bar: 0, foo: "initial-1" }');

	const storage_1 = server_1.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
		initialObject: {
			bar: 0,
			foo: 'initial-1',
		}
	});

	await Promise.all([
		server_1.join(),
		server_2.join(),
		server_3.join(),
	]);

	logger.debug('Setting bar property on server_1 to 1');

	await storage_1.set('bar', 1);
	
	logger.debug('Waiting 5s so the expiration of the logs will be triggered');
	await new Promise(resolve => setTimeout(resolve, 5000));

	logger.debug('Setting bar property on server_1 to 2');
	await storage_1.set('bar', 2);

	logger.debug('Creating a record on server_3 and initializing it with { bar: 0, foo: "initial-3" }');

	const storage_3 = server_3.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
		initialObject: {
			bar: 0,
			foo: 'initial-3',
		}
	});

	// we can wait explicitly the initialization of the record
	// await storage_3.initializing;

	// or we can just simply trying to set a value and wait for the promise
	await storage_3.set('something', 3);

	logger.debug(`Getting record from server3: { bar: %d, foo: %s, something: %d }`, storage_3.get('bar'), storage_3.get('foo'), storage_3.get('something'));

	logger.debug('record on server_1 has no use any more');
	storage_1.close();

	logger.debug('Waiting 2s');
	await new Promise(resolve => setTimeout(resolve, 2000));

	logger.debug('Server_2 needs the record, so it will be initialized with the latest value');

	const storage_2 = server_2.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
		initialObject: {
			bar: 0,
			foo: 'initial-2',
		}
	});

	logger.debug('Setting something property on server_2 to 5');
	await storage_2.insert('something', 5);

	logger.debug(`Getting record from server2: { bar: %d, foo: %s, something: %d }`, storage_2.get('bar'), storage_2.get('foo'), storage_2.get('something'));

	server_1.stop();
	server_2.stop();
	server_3.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

