import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'reelection-example',
	level: 'debug',
});


export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const server_3 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_1.on('message', server_3.accept.bind(server_3));
	server_2.on('message', server_1.accept.bind(server_1));
	server_2.on('message', server_3.accept.bind(server_3));
	server_3.on('message', server_1.accept.bind(server_1));
	server_3.on('message', server_2.accept.bind(server_2));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_1.addRemotePeerId(server_3.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	server_2.addRemotePeerId(server_3.localPeerId);
	server_3.addRemotePeerId(server_1.localPeerId);
	server_3.addRemotePeerId(server_2.localPeerId);
	
	server_1.start();
	server_2.start();
	server_3.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
		new Promise(resolve => server_3.once('leader-changed', resolve)),
	]);

	logger.info('Raft States server1: %s, server2: %s, server3: %s', server_1.state, server_2.state, server_3.state);

	const leader = [server_1, server_2, server_3].find(server => server.state === 'leader');
	const followers = [server_1, server_2, server_3].filter(server => server.state === 'follower');

	if (!leader) throw new Error('No leader found');

	// leader is disconnected for some reason
	leader.stop();

	// first every follower should detect the leader is gone
	await Promise.all(followers.map(follower => new Promise(resolve => follower.once('leader-changed', resolve))));
	
	// around that time a manager component handles the job to remove it from the remote peer id lists
	followers.forEach(follower => follower.removeRemotePeerId(leader?.localPeerId));

	// then the followers should start an election
	await Promise.all(followers.map(follower => new Promise(resolve => follower.once('leader-changed', resolve))));

	logger.info('Raft States server1: %s, server2: %s, server3: %s', server_1.state, server_2.state, server_3.state);

	// let's turn back the prev leader
	leader.start();

	// and add back to the remote peer id lists
	followers.forEach(follower => follower.addRemotePeerId(leader.localPeerId));

	await new Promise(resolve => leader?.once('leader-changed', resolve));

	logger.info('Raft States server1: %s, server2: %s, server3: %s', server_1.state, server_2.state, server_3.state);

	server_1.stop();
	server_2.stop();
	server_3.stop();
}

if (require.main === module) {
	logger.info('Running eample from module file');
	setHamokLogLevel('warn');
	run();
}