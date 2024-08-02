import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'emitter-example',
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
	
	server_1.start();
	server_2.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	const emitter_1 = server_1.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const emitter_2 = server_2.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const listener = (number: number, string: string, boolean: boolean) => {
		logger.debug('Event-1 received by server_1: %s, %s, %s', number, string, boolean);
	};
	await emitter_1.subscribe('event-1', listener);
	await emitter_2.subscribe('event-1', (number: number, string: string, boolean: boolean) => {
		logger.debug('Event-1 received by server_2: %s, %s, %s', number, string, boolean);
	});
	await emitter_2.subscribe('event-2', (number, string) => {
		logger.debug('Event-2 received by server_2: %s, %s', number, string);
	});

	logger.debug('Publishing event-1 from server_2');
	emitter_2.publish('event-1', 1, 'hello', true);

	logger.debug('Publishing event-2 from server_1');
	emitter_1.publish('event-2', 2, 'world');

	logger.debug('Unsubscribing from event-1 on server_1');
	await emitter_1.unsubscribe('event-1', listener);

	logger.debug('Publishing event-1 from server_2');
	emitter_1.publish('event-1', 3, 'hello', false);

	logger.debug('Publishing event-2 from server_1');
	emitter_1.publish('event-2', 4, 'world');

	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
