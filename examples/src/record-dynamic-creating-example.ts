import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'record-insert-get-example',
	level: 'debug',
});

type MySharedConfig = {
	foo: string;
	bar: number;
}

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const messageHub = new HamokMessageHub();
	
	messageHub.add(server_1, server_2);
	logger.info('Creating a record and initializing it with { bar: 0, foo: "initial" }');

	const storage_1 = server_1.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
		initialObject: {
			bar: 0,
			foo: 'initial',
		}
	});

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);


	logger.debug('Setting bar property on server_1 to 1');

	await storage_1.set('bar', 1);
	
	logger.debug(`Getting record from server1: { bar: %d, foo: %s }`, storage_1.get('bar'), storage_1.get('foo'));

	logger.debug('Creating a record on server2 and initializing it with { bar: 0, foo: "initial-2" }');
	const storage_2 = server_2.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
		initialObject: {
			bar: 0,
			foo: 'initial-2',
		}
	});

	logger.debug('Waiting for storage_2 to be initialized');
	await storage_2.ready;

	logger.debug(`Getting record from server2: { bar: %d, foo: %s }`, storage_2.get('bar'), storage_2.get('foo'));

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('debug');
	run();
}

