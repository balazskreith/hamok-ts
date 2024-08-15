import { Hamok, HamokEventMap, HamokFetchRemotePeersResponse, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'common-join-example',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	// by having the communication channel we assume we can inquery remote endpoints
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	logger.info('Server 1 and Server 2 joined');

	// add new Hamok to the grid
	const server_3 = new Hamok();
	server_3.on('message', server_1.accept.bind(server_1));
	server_3.on('message', server_2.accept.bind(server_2));
	server_1.on('message', server_3.accept.bind(server_3));
	server_2.on('message', server_3.accept.bind(server_3));

	await server_3.join();

	logger.info('Server 3 joined, let\'s stop server_1 %s', server_1.localPeerId);
	
	await Promise.all([
		new Promise<void>(resolve => server_2.once('no-heartbeat-from', peerId => (logger.info('Server_2 no-heartbeat-from %s', peerId), resolve()))),
		new Promise<void>(resolve => server_3.once('no-heartbeat-from', peerId => (logger.info('Server_3 no-heartbeat-from %s', peerId), resolve()))),
		Promise.resolve(server_1.stop())
	]);

	server_2.stop();
	server_3.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
