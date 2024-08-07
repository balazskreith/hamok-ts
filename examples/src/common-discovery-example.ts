import { Hamok, HamokEventMap, HamokFetchRemotePeersResponse, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'common-waiting-example',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	// by having the communication channel we assume we can inquery remote endpoints
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));

	server_1.on('hello-notification', createHelloListener(server_1));
	server_1.on('no-heartbeat-from', createNoHeartbeatFromListener(server_1));
	server_2.on('hello-notification', createHelloListener(server_2));
	server_2.on('no-heartbeat-from', createNoHeartbeatFromListener(server_2));

	// we fetch the remote endpoints
	await server_1.fetchRemotePeers().then((response) => fetchRemoteEndpointHandler(server_1, response));
	await server_2.fetchRemotePeers().then((response) => fetchRemoteEndpointHandler(server_2, response));
	
	server_1.start();
	server_2.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	// add new Hamok to the grid
	const server_3 = new Hamok();
	server_3.on('message', server_1.accept.bind(server_1));
	server_3.on('message', server_2.accept.bind(server_2));
	server_1.on('message', server_3.accept.bind(server_3));
	server_2.on('message', server_3.accept.bind(server_3));

	server_3.on('hello-notification', createHelloListener(server_3));
	server_3.on('no-heartbeat-from', createNoHeartbeatFromListener(server_3));
	await server_3.fetchRemotePeers().then((response) => fetchRemoteEndpointHandler(server_3, response));

	await new Promise(resolve => {
		server_3.once('leader-changed', resolve)
		server_3.start();
	});

	logger.info('Leader changed');
	
	await Promise.all([
		new Promise(resolve => server_2.once('no-heartbeat-from', resolve)),
		new Promise(resolve => server_3.once('no-heartbeat-from', resolve)),
		Promise.resolve(server_1.stop())
	]);

	logger.info('Server_1 stopped');
	
	server_2.stop();
	server_3.stop();
}

function createHelloListener(server: Hamok): (...args: HamokEventMap['hello-notification']) => void {
	return (remotePeerId, request) => {
		logger.info('%s received hello from %s, customRequest: %s', server.localPeerId, remotePeerId, request?.customData);
		server.addRemotePeerId(remotePeerId);

		// IMPORTANT! if the notification holds a request, we must call the callback
		if (request) request.callback('Hello from server');
	};
}

function createNoHeartbeatFromListener(server: Hamok): (...args: HamokEventMap['no-heartbeat-from']) => void {
	return (remotePeerId) => {
		logger.info('%s received no heartbeat from %s', server.localPeerId, remotePeerId);
		server.removeRemotePeerId(remotePeerId);
	};
}

function fetchRemoteEndpointHandler(server: Hamok, response: HamokFetchRemotePeersResponse): void {
	logger.info('Adding remote peers to %s: %o', server.localPeerId, response.remotePeers);
	response.remotePeers.forEach(remotePeerId => server.addRemotePeerId(remotePeerId));
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
