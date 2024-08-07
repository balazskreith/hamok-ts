import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'map-events-example',
	level: 'debug',
});

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();

	server_1.on('message', server_2.accept.bind(server_2));
	server_1.on('message', server_2.accept.bind(server_1));
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

	const storage_1 = server_1.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});

	storage_1
		.on('insert', (key, value) => logger.info(`Server_1 storage Inserted key: ${key}, value: ${value}`))
		.on('update', (key, oldValue, newValue) => logger.info(`Server_1 storage Updated key: ${key}, oldValue: ${oldValue}, newValue: ${newValue}`))
		.on('remove', (key, value) => logger.info(`Server_1 storage Removed key: ${key}, value: ${value}`))
		.on('clear', () => logger.info(`Server_1 storage Cleared`))
		.once('close', () => logger.info(`Server_1 storage Closed`));
	;
	
	logger.debug('Setting value in storage on server_2 for key to 0');
	await storage_2.set('key', 0);

	logger.debug('Setting value in storage on server_2 for key to 1');
	await storage_2.set('key', 1);

	logger.debug('Removing value in storage on server_2 for key');
	await storage_2.remove('key');

	logger.debug('Inserting value in storage on server_2 for key to 1');
	await storage_2.insert('key', 1);

	logger.debug('Setting value in storage on server_2 for key to 2');
	await storage_2.set('key', 2);

	logger.debug('Clearing storage on server_2');
	await storage_2.clear();

	logger.debug('Closing storage on server_2');
	storage_1.close();

	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

