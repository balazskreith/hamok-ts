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

const logger = pino.pino({
	name: 'common-join-example-2',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok({
		onlyFollower: true,
	});
	logger.info('server 1 is %s', server_1.localPeerId);
	const server1Acceptor = server_1.accept.bind(server_1);

	let server_1_joined = false;

	for (let i = 0; i < 10; ++i) {
		const server_2 = new Hamok();
		// by having the communication channel we assume we can inquery remote endpoints
		logger.info('server 2 is %s', server_2.localPeerId);

		const server2Acceptor = server_2.accept.bind(server_2);

		server_1.on('message', server2Acceptor);
		server_2.on('message', server1Acceptor);

		const timer = setInterval(() => {
			logger.debug('\
				\niteration: %d, \
				\nserver_1 (%s, state: %s) remotePeers are %s, \
				\nserver_2 (%s, state: %s) remotePeers are %s',
				i,
				server_1.localPeerId,
				server_1.state,
				[...server_1.remotePeerIds].join(', '),
				server_2.localPeerId,
				server_2.state,
				[...server_2.remotePeerIds].join(', '),
			);
		}, 1000)
		

		await Promise.all([
			server_1_joined ? Promise.resolve() : server_1.join(),
			server_2.join(),
		]);

		logger.info('Server 1 and Server 2 joined');

		server_2.close();

		server_1.off('message', server2Acceptor);
		server_2.off('message', server1Acceptor);

		server_1_joined = true;
		server_1.raft.config.onlyFollower = false;
		clearInterval(timer);
	}

	
	logger.info('Close');

	server_1.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('debug');
	run();
}
