

import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'common-join-example-2',
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
			servers.delete(server.localPeerId);
			messageHub.remove(server);
			server.off('leader-changed', leaderChangedListener);
		})
		servers.set(server.localPeerId, server);
		messageHub.add(server);
		server.on('leader-changed', leaderChangedListener);
	}
	addServer(new Hamok());
	addServer(new Hamok());
	addServer(new Hamok());

	await Promise.all([...servers.values()].map(server => server.join()));


	
	for (let i = 0; i < 10; ++i) {
		const newServer = new Hamok();
		const oldServer = servers.values().next().value;
		addServer(newServer);
		// by having the communication channel we assume we can inquery remote endpoints


		const timer = setInterval(() => {
			const messages: string[] = [];
			for (const server of servers.values()) {
				messages.push(`server (${server.localPeerId}, state: ${server.state}) remotePeers are ${[...server.remotePeerIds].join(', ')}`);
			}
			logger.debug('iteration: %d\n, %s', i, messages.join('\n'));
		}, 1000)
		

		await newServer.join();

		const messages: string[] = [];
		for (const server of servers.values()) {
			messages.push(`server (${server.localPeerId}, state: ${server.state}) remotePeers are ${[...server.remotePeerIds].join(', ')}`);
		}
		logger.debug('iteration: %d\n, %s', i, messages.join('\n'));
	
		oldServer.close();

		clearInterval(timer);
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
