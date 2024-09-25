/*
  This example demonstrates how to manage a small Hamok cluster with multiple servers, focusing on 
  dynamic joining, leaving, and handling peer connections in a distributed environment.

  Workflow:
  1. Initialization:
     - Two servers (`server_1` and `server_2`) are initialized, and their local peer IDs are logged.
     - The servers are set up to communicate by listening to each other's messages.
     
  2. Joining the Cluster:
     - Both servers join the cluster, and a third server (`server_3`) is added to the cluster later.

  3. Handling Server Leaving:
     - `server_1` leaves the cluster. The example monitors how `server_2` and `server_3` handle this event, including leader re-election.

  4. Rejoining the Cluster:
     - After a pause, `server_1` re-joins the cluster. The example ensures that the rejoin event is correctly triggered and handled.

  5. Final Cleanup:
     - The servers are gracefully closed, terminating the cluster.

  Practical Use:
  - Cluster Management: The example is useful for understanding how to manage a dynamic cluster using Hamok, 
    including handling server failures, leader elections, and reconnections.
  - Event Handling: Demonstrates how to use Hamok’s event system to monitor and react to changes in the cluster.
  - Logging: Provides a practical example of integrating logging into a Hamok-based system for debugging and monitoring purposes.

  This example is suitable for developers looking to implement or understand distributed systems using the Hamok library.
*/


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
