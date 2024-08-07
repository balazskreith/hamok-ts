import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'map-insert-get-example',
	level: 'debug',
});

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	const storage_1 = server_1.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});

	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.start();
	server_2.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	const value_1 = 1;
	const value_2 = 2;

	logger.debug(`Inserting values into replicated storage. Candidates to insert from server1: ${value_1}, server2: ${value_2}`);

	const [ reply_1, reply_2 ] = await Promise.all([
		storage_1.insert('key', value_1),
		storage_2.insert('key', value_2),
	]).catch(err => {
		logger.error('Error inserting values into replicated storage: %s', `${err}`);
		throw err;
	});

	// the insert works in a way that the first server that insert the value got undefined as response
	// and the second server that try to insert the value got the value that was already inserted
	const succeededServer = reply_1 ? 'Server_2' : 'Server_1';
	const insertedValue = reply_1 ?? reply_2;

	logger.info(`${succeededServer} inserted value ${insertedValue}`);

	// we can di in batches
	logger.info('Inserting values in batch. Server_1 tries to insert "key-1" and "key-2", Server_2 tries to insert "key-2" and "key-3"');
	const [existing_1, existing_2 ] = await Promise.all([
		storage_1.insertAll(new Map([['key-1', 1], ['key-2', 2]])),
		storage_2.insertAll(new Map([['key-2', 3], ['key-3', 4]])),
	]);
	
	logger.info(`Server_1 inserted value for "key-1": ${!existing_1.get('key-1')}`);
	logger.info(`Server_1 inserted value for "key-2": ${!existing_1.get('key-2')}`);
	logger.info(`Server_2 inserted value for "key-2": ${!existing_2.get('key-2')}`);
	logger.info(`Server_2 inserted value for "key-3": ${!existing_2.get('key-3')}`);

	logger.info(`Server_1 get value for key: "key": ${storage_1.get('key')}`);
	logger.info(`Server_2 get value for key: "key": ${storage_2.get('key')}`);
	logger.info(`Server_1 get value for key: "key-1": ${storage_1.get('key-1')}`);
	logger.info(`Server_2 get value for key: "key-1": ${storage_2.get('key-1')}`);
	logger.info(`Server_1 get value for key: "key-2": ${storage_1.get('key-2')}`);
	logger.info(`Server_2 get value for key: "key-2": ${storage_2.get('key-2')}`);
	logger.info(`Server_1 get value for key: "key-3": ${storage_1.get('key-3')}`);
	logger.info(`Server_2 get value for key: "key-3": ${storage_2.get('key-3')}`);

	logger.info('Setting key-4 to 3 by Server 1');
	await storage_1.set('key-4', 3);

	logger.info('Getting key-4 by server_1 %d', storage_1.get('key-4'));

	// it can happen that the leader server get the value faster than the follower.
	// the storage will not be inconsistent ever, becasue the RAFT logs are applied in the same order
	// in all the servers.
	// what we face here is the following situation: server_1 is the leader, and server_2 is the follower
	// hence storage_1 submits the value to the leader and the leader applies at once it got an acknoeldgement
	// from the majority of the followers, and then the leader commits the value up, and notify the followers 
	// about the new commit index in the next heartbeat. 
	// so in case you query the value in the follower before the leader heartbeat send the message about a new commit index 
	// you will get the old value, but the value is already committed in the RAFT logs, and the follower
	// will apply the value in order.
	
	// if you apply a new value in server_2 it blocks the thread until the value is not set, 
	// consequently the previous commit will also be applied.
	await storage_2.set('meaningless', 0);

	// alternatively you can wait until the follower get the new commit index
	// await server_2.waitUntilCommitHead();

	// or you can just wait one heartbeat
	// await new Promise(resolve => setTimeout(resolve, server_2.raft.config.heartbeatInMs));

	logger.info('Getting key-4 by server_2 %d', storage_2.get('key-4'));

	// we want to use the follower storage, becasue the leader storage get the 
	// faster than any of the follower, so it can happen that the replicated storage
	// at the follower have different value, but it's not becasue it is inconsistent, 
	// as the RAFT logs appears and the same operations are executed exactly in the same order
	const storage = server_1.leader ? storage_2 : storage_1;
	const updatedValue = Math.random();

	logger.debug(`Updating value in replicated storage. We want to update the value to : ${updatedValue}`);
	
	await storage.set('key', updatedValue);

	logger.debug(`After updated getting value from server1: ${storage_1.get('key')}`);
	logger.debug(`After updated getting value from server2: ${storage_2.get('key')}`);

	logger.debug(`Deleting value from replicated storage`);

	await storage.delete('key');

	logger.debug(`After deleted getting value from server1: ${storage_1.get('key')}`);
	logger.debug(`After deleted getting value from server2: ${storage_2.get('key')}`);

	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

