
import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'common-rollout-example',
	level: 'debug',
});

export async function run() {

	const servers = new Map<string, Hamok>();
	const messageHub = new HamokMessageHub();
	const addServer = (server: Hamok) => {
		const leaderChangedListener = () => {
			logger.debug('Server %s, State: %s remotePeers: %s', server.localPeerId, server.raft.state.stateName, [...server.remotePeerIds].join(', '));
		}
		server.once('close', () => {
			logger.info('Server %s closed', server.localPeerId);
			servers.delete(server.localPeerId);
			messageHub.remove(server);
			server.off('leader-changed', leaderChangedListener);
		})
		servers.set(server.localPeerId, server);
		messageHub.add(server);
		server.on('leader-changed', leaderChangedListener);
		logger.info('Server %s added', server.localPeerId);
	}
	addServer(new Hamok());
	addServer(new Hamok());
	addServer(new Hamok());

	await Promise.all([...servers.values()].map(server => server.join()));

	for (let i = 0; i < 10; ++i) {
		logger.info(`
			----------------
			Iteration %d
			----------------
			`, i);

		const oldServer = [...servers.values()].find(server => server.leader);
		
		if (!oldServer) {
			logger.error('!!!!!!!! No leader found');
			break;
		}

		const newServer = new Hamok();
		addServer(newServer);

		logger.info('!!!!!!!! Old server is %s, new server is %s', oldServer.localPeerId, newServer.localPeerId);

		await newServer.join();

		logger.info('!!!!!!!! New server joined, let\'s stop old server %s', oldServer.localPeerId);

		await oldServer.leave();

		logger.info('!!!!!!!! Old server left, make sure new server has a leader');

		oldServer.close();

		logger.info('!!!!!!!! Old server closed, wait 5s');

		await new Promise(resolve => setTimeout(resolve, 5000));

		logger.info('!!!!!!!! Wait until we have a leader');

		await Promise.all([...servers.values()].map(server => server.waitUntilLeader()));

		
	}
	
	logger.info('Close');

	for (const server of servers.values()) {
		server.close();
	}
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('debug');
	run();
}
