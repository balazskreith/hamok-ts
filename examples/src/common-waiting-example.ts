import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
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
	
	server_1.start();
	// server_2.start();

	const emitter_1 = server_1.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
		maxMessageWaitingTimeInMs: 20000,
	});

	logger.debug('Subscribing to event-1 on server_1, but server2 is not started');

	await new Promise((resolve, reject) => emitter_1.subscribe('event-1', () => void 0)
		.then(() => reject('Should not subscribe to a not connected Hamok'))
		.catch(resolve))

	logger.info('Starting server_2after 5s of waiting');
	await new Promise((resolve, reject) => {
		setTimeout(() => {
			logger.info('Starting server_2');
			server_2.start();
		}, 5000);
		emitter_1.subscribe('event-1', () => void 0).then(resolve).catch(reject);
	});

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	await emitter_1.subscribe('event-1', () => void 0);

	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
