import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'import-export-example',
	level: 'debug',
});


setHamokLogLevel('info');

const server_1 = new Hamok();
const server_2 = new Hamok();

server_1.on('message', server_2.accept.bind(server_2));
server_2.on('message', server_1.accept.bind(server_1));

server_1.addRemotePeerId(server_2.localPeerId);
server_2.addRemotePeerId(server_1.localPeerId);

server_1.start();
server_2.start();

(async () => {
	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	
})()


setTimeout(() => {
	server_1.stop();
	server_2.stop();
}, 30000)