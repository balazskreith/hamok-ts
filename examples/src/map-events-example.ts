import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'map-events-example',
	level: 'debug',
});

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const messageHub = new HamokMessageHub();

	messageHub.add(server_1, server_2);
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

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

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

