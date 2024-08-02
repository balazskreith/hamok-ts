import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'storage-update-if-example',
	level: 'debug',
});

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

	const storage_1 = server_1.createStorage<string, number>({
		storageId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createStorage<string, number>({
		storageId: 'my-replicated-storage',
	});
	// const storage_3 = server_3.createReplicatedStorage<string, number>({
	// 	storageId: 'my-replicated-storage',
	// });

	logger.debug('Setting value in storage for key to 0');	
	await storage_1.set('key', 0);
	// await storage_1.set('key', 2);

	logger.info('Getting value from replicated storage: %d', storage_1.get('key'));

	logger.debug('Updating value in storage for key to 1 if previous value is 0, or to 3 if previous value is 2');
	await Promise.all([
		storage_1.updateIf('key', 1, 0),
		storage_2.updateIf('key', 3, 2),
	])
	
	await storage_1.set('not-important-key', 9);

	logger.debug('Getting value from replicated storage: %d', storage_1.get('key'));
}

if (require.main === module) {
	logger.info('Running from a module file');
	setHamokLogLevel('info');
	run();
}

