import { Hamok, HamokConfig, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'emitter-example',
	level: 'debug',
});

type ExampleEventMap = {
	'event-1': [string],
	'event-2': [string],
}

const hamokConfig: Partial<HamokConfig> = {
	logEntriesExpirationTimeInMs: 5000,
};

export async function run() {

	const server_1 = new Hamok(hamokConfig);
	const server_2 = new Hamok(hamokConfig);
	const server_3 = new Hamok(hamokConfig);
	const messageHub = new HamokMessageHub();
	const emitter_1 = server_1.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const emitter_2 = server_2.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const event1_listener_1 = (msg: string) => {
		logger.debug('Event-1 received by server_1: %s', msg);
	};
	
	messageHub.add(server_1, server_2, server_3);
	
	logger.info('We subscribe to event-1 on server_1 before servers are joining');
	emitter_1.subscribe('event-1', event1_listener_1);

	logger.info('We send a message on server_2 before servers are joining');
	emitter_2.publish('event-1', 'publish payload by server_2 before joining');
	emitter_2.notify('event-1', 'notify payload by server_2 before joining');
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	logger.info('Servers are joined');

	await emitter_1.initializing;
	await emitter_2.initializing;

	logger.info('We wait 10s for expiring original logs')
	await new Promise(resolve => setTimeout(resolve, 10000));

	logger.info('we also add some listeners to server_2 to trigger the expiration of logs');
	emitter_2.subscribe('event-2', (msg: string) => logger.debug('Event-2 received by server_2: %s', msg));

	const emitter_3 = server_3.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});

	await server_3.join();

	await emitter_3.publish('event-1', 'publish payload by server_3 after joining');

	server_1.close();
	server_2.close();
	server_3.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
