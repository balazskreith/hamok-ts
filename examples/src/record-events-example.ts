import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'record-events-example',
	level: 'debug',
});

type MyRecord = {
	foo: string;
	bar: number;
}

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.start();
	server_2.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	const storage_1 = server_1.createRecord<MyRecord>({
		recordId: 'my-replicated-record',
	});
	const storage_2 = server_2.createRecord<MyRecord>({
		recordId: 'my-replicated-record',
	});

	storage_1.on('insert', ({ key, value }) => logger.info(`Server_1 storage Inserted key: ${key}, value: ${value}`));
	storage_1.on('update', ({ key, oldValue, newValue }) => logger.info(`Server_1 storage Updated key: ${key}, oldValue: ${oldValue}, newValue: ${newValue}`));
	storage_1.on('remove', ({ key, value }) => logger.info(`Server_1 storage Removed key: ${key}, value: ${value}`));

	storage_2.on('insert', ({ key, value }) => logger.info(`Server_2 storage Inserted key: ${key}, value: ${value}`));
	storage_2.on('update', ({ key, oldValue, newValue }) => logger.info(`Server_2 storage Updated key: ${key}, oldValue: ${oldValue}, newValue: ${newValue}`));
	storage_2.on('remove', ({ key, value }) => logger.info(`Server_2 storage Removed key: ${key}, value: ${value}`));

	await storage_1.set('foo', 'hello');
	await storage_1.set('foo', 'world');
	await storage_1.delete('foo');

	await storage_2.set('bar', 1);
	await storage_2.updateIf('bar', 1, 2);
	await storage_2.updateIf('bar', 2, 1);

	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

