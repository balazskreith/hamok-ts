import { Hamok, HamokEventMap, HamokFetchRemotePeersResponse, HamokMessage, setHamokLogLevel } from 'hamok';
import EventEmitter from 'events';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'common-waiting-example',
	level: 'debug',
});

const pubSubServer = new class extends EventEmitter<{ message: [HamokMessage] }> {
	private _servers = new Map<string, Hamok>();	
	public add(server: Hamok) {
		server.on('message', (message) => this.emit('message', message));
		this.on('message', (message) => server.accept(message));
		this._servers.set(server.localPeerId, server);
	}
	public remove(server: Hamok) {
		server.removeAllListeners('message');
		this.off('message', (message) => server.accept(message));
		this._servers.delete(server.localPeerId);
	}
};

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	// by having the communication channel we assume we can inquery remote endpoints
	pubSubServer.add(server_1);
	pubSubServer.add(server_2);

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
	pubSubServer.add(server_3);

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
		Promise.resolve(server_1.stop()),
		Promise.resolve(pubSubServer.remove(server_1)),
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
