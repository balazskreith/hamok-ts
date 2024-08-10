import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'common-waiting-example-2',
	level: 'debug',
});

type ExampleEventMap = {
	'event-1': [number, string, boolean],
	'event-2': [number, string],
}

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();

	const storage_1 = server_1.createMap<string, number>({
		mapId: 'my-replicated-storage',
		maxMessageWaitingTimeInMs: 20000,
	});
	const storage_2 = server_2.createMap<string, number>({
		mapId: 'my-replicated-storage',
		maxMessageWaitingTimeInMs: 20000,
	});

	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.start();
	server_2.start();

	await storage_1.insert('key', 1);
	await server_2.waitUntilCommitHead();

	logger.info('Value from server_2: %s', storage_1.get('key'));

	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
