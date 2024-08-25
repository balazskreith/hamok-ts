import { Hamok, HamokEventMap, HamokFetchRemotePeersResponse, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'common-join-example',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();

	logger.info('server 1 is %s', server_1.localPeerId);
	logger.info('server 2 is %s', server_2.localPeerId);
	
	// by having the communication channel we assume we can inquery remote endpoints
	const server1Acceptor = server_1.accept.bind(server_1);
	const server2Acceptor = server_2.accept.bind(server_2);

	server_1.on('message', server2Acceptor);
	server_2.on('message', server1Acceptor);

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	logger.info('Server 1 and Server 2 joined');

	// add new Hamok to the grid
	const server_3 = new Hamok();
	const server3Acceptor = server_3.accept.bind(server_3);

	logger.info('server 3 is %s', server_3.localPeerId);

	server_3.on('message', server1Acceptor);
	server_3.on('message', server2Acceptor);
	server_1.on('message', server3Acceptor);
	server_2.on('message', server3Acceptor);

	await server_3.join();

	logger.info('Server 3 joined, let\'s stop server_1 %s', server_1.localPeerId);
	
	await Promise.all([
		new Promise<void>(resolve => server_2.once('no-heartbeat-from', peerId => (logger.info('Server_2 no-heartbeat-from %s', peerId), resolve()))),
		new Promise<void>(resolve => server_3.once('no-heartbeat-from', peerId => (logger.info('Server_3 no-heartbeat-from %s', peerId), resolve()))),
		server_1.leave()
	]);

	logger.info('Server 1 left, let\'s wait for 5s if everything is ok');

	await new Promise(resolve => setTimeout(resolve, 5000));

	logger.info('Let\'s join server_2 %s', server_2.localPeerId);

	await Promise.all([
		new Promise<void>(resolve => server_1.once('remote-peer-joined', peerId => (logger.info('Server_1 %s joined', peerId), resolve()))),
		new Promise<void>(resolve => server_3.once('remote-peer-joined', peerId => (logger.info('Server_3 %s joined', peerId), resolve()))),
		server_2.join()
	]);

	await new Promise(resolve => setTimeout(resolve, 5000));

	logger.info('We remove server1Acceptor from server_2 and server_3 and see if rejoin event is triggered');

	await Promise.all([
		new Promise<void>(resolve => server_1.once('rejoining', () => (logger.info('Server_1 rejoin'), resolve()))),
		Promise.resolve(server_2.off('message', server1Acceptor)),
		Promise.resolve(server_3.off('message', server1Acceptor)),
		Promise.resolve(server_1.off('message', server2Acceptor)),
		Promise.resolve(server_1.off('message', server3Acceptor)),
	]);

	logger.info('We add server1Acceptor to server_2 and server_3 and see if joined event is triggered');

	await Promise.all([
		new Promise<void>(resolve => server_1.once('joined', () => (logger.info('Server_1 joined'), resolve()))),
		Promise.resolve(server_2.on('message', server1Acceptor)),
		Promise.resolve(server_3.on('message', server1Acceptor)),
		Promise.resolve(server_1.on('message', server2Acceptor)),
		Promise.resolve(server_1.on('message', server3Acceptor)),
	]);

	logger.info('Close');

	server_1.close();
	server_2.close();
	server_3.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('warn');
	run();
}
