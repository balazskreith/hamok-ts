import { Hamok, HamokConfig, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'map-events-example',
	level: 'debug',
});
const hamokConfig: Partial<HamokConfig> = {
	logEntriesExpirationTimeInMs: 5000,
};

export async function run() {
	const server_1 = new Hamok(hamokConfig);
	const server_2 = new Hamok(hamokConfig);
	const messageHub = new HamokMessageHub();
	const storage_1 = server_1.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	
	messageHub.add(server_1, server_2);
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);
	logger.debug('Setting value in storage on server_1 for key to 0');
	await storage_1.set('key', 0);

	logger.debug('Wait 10s to expire logs');
	await new Promise(resolve => setTimeout(resolve, 10000));

	logger.debug('Set a value for key-2 to trigger the expiration of logs');
	await storage_1.set('key-2', 2);

	// creating a new storage on server_2
	const storage_2 = await server_2.createMap<string, number>({
		mapId: 'my-replicated-storage',
	}).ready;	
	
	logger.debug('Getting record from server2: { key: %d }', storage_2.get('key'));
	
	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

