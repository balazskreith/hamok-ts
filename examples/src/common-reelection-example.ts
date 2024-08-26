import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'reelection-example',
	level: 'debug',
});


export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const server_3 = new Hamok();
	const messageHub = new HamokMessageHub();

	server_1.on('remote-peer-joined', (peerId) => logger.info('Server_1 has remote-peer-joined event for %s', peerId));
	server_2.on('remote-peer-joined', (peerId) => logger.info('Server_2 has remote-peer-joined event for %s', peerId));
	server_3.on('remote-peer-joined', (peerId) => logger.info('Server_3 has remote-peer-joined event for %s', peerId));
	server_1.on('remote-peer-left', (peerId) => logger.info('Server_1 has remote-peer-left event for %s', peerId));
	server_2.on('remote-peer-left', (peerId) => logger.info('Server_2 has remote-peer-left event for %s', peerId));
	server_3.on('remote-peer-left', (peerId) => logger.info('Server_3 has remote-peer-left event for %s', peerId));

	messageHub.add(server_1, server_2, server_3);
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
		server_3.join(),
	]);
	const servers = [['server_1', server_1], ['server_2', server_2], ['server_3', server_3]] as const;
	
	for (let i = 0; i < 10; i++) {
		logger.info('------------- ROUND %d ---------------', i);
		logger.info('Raft States server1: %s, server2: %s, server3: %s', server_1.state, server_2.state, server_3.state);

		const [name, server] = servers[i % 3];
	
		logger.info('%s leaves (%s)', name, server.localPeerId);
		await server.leave();
	
		// every follower should detect the leader is gone
		await Promise.all(servers.filter(([_, s]) => s !== server).map(([_, s]) => s.waitUntilLeader()));
		
		logger.info('Raft States server1: %s, server2: %s, server3: %s', server_1.state, server_2.state, server_3.state);
	
		// let's turn back the prev leader

		logger.info('%s joins back', name);
		await server.join();
	
		logger.info('Raft States server1: %s, server2: %s, server3: %s', server_1.state, server_2.state, server_3.state);
	}

	server_1.close();
	server_2.close();
	server_3.close();
}

if (require.main === module) {
	logger.info('Running eample from module file');
	setHamokLogLevel('warn');
	run();
}