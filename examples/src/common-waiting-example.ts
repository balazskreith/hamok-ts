import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'common-waiting-example',
	level: 'debug',
});

type ExampleEventMap = {
	'event-1': [number, string, boolean],
	'event-2': [number, string],
}

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.join();
	// server_2.start();

	const emitter_1 = server_1.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const emitter_2 = server_2.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});

	logger.debug('Subscribing to event-1 on server_1, but server2 is not started');

	emitter_1.notify('event-1', 1, 'hello', true);

	logger.info('Starting server_2after 5s of waiting');
	
	emitter_2.subscribe('event-1', (a, b, c) => {
		logger.info('Server_2 received event-1 with %d, %s, %s', a, b, c);
	});

	await server_2.join();
	await emitter_1.initializing;
	await emitter_2.initializing;

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
