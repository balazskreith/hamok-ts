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
	name: 'common-join-example',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok({
		onlyFollower: true,
	});
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
		new Promise<void>(resolve => server_2.once('remote-peer-left', peerId => (logger.info('Server_2 has remote-peer-left event for %s', peerId), resolve()))),
		new Promise<void>(resolve => server_3.once('remote-peer-left', peerId => (logger.info('Server_3 has remote-peer-left event for %s', peerId), resolve()))),
		server_1.leave()
	]);

	logger.info('Server 1 left, make sure server_2 and server_3 have a leader');

	await Promise.all([
		server_2.waitUntilLeader(), // or you use server_2.joining
		server_3.waitUntilLeader(), // or you use server_3.joining
	])

	logger.info('Server 1 left, let\'s wait for 5s if everything is ok');

	await new Promise(resolve => setTimeout(resolve, 5000));

	logger.info('Let\'s join server_1 %s', server_1.localPeerId);

	await Promise.all([
		new Promise<void>(resolve => server_2.once('remote-peer-joined', peerId => (logger.info('Server_1 has remote-peer-joined event for %s ', peerId), resolve()))),
		new Promise<void>(resolve => server_3.once('remote-peer-joined', peerId => (logger.info('Server_3 has remote-peer-joined event for %s', peerId), resolve()))),
		server_1.join()
	]);

	await new Promise(resolve => setTimeout(resolve, 5000));

	logger.info('We remove server1Acceptor from server_2 and server_3 and see if rejoin event is triggered');

	logger.info('Waiting for rejoining event');

	await Promise.all([
		new Promise<void>(resolve => server_1.once('rejoining', () => (logger.info('Server_1 rejoin'), resolve()))),
		Promise.resolve(server_2.off('message', server1Acceptor)),
		Promise.resolve(server_3.off('message', server1Acceptor)),
		Promise.resolve(server_1.off('message', server2Acceptor)),
		Promise.resolve(server_1.off('message', server3Acceptor)),
	]);

	logger.info('We add server1Acceptor to server_2 and server_3 and see if joined event is triggered');

	logger.info('Waiting for joined event');

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
	setHamokLogLevel('debug');
	run();
}
