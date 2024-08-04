import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'map-insert-get-example',
	level: 'debug',
});

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
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

	const storage_1 = server_1.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	// const storage_3 = server_3.createReplicatedStorage<string, number>({
	// 	storageId: 'my-replicated-storage',
	// });

	const value_1 = Math.random();
	const value_2 = Math.random();

	logger.debug(`Inserting values into replicated storage. Candidates to insert from server1: ${value_1}, server2: ${value_2}`);

	const [ reply_1, reply_2 ] = await Promise.all([
		storage_1.insert('key', value_1),
		storage_2.insert('key', value_2),
	]).catch(err => {
		logger.error('Error inserting values into replicated storage: %s', `${err}`);
		throw err;
	});

	// we want to use the follower storage, becasue the leader storage get the 
	// faster than any of the follower, so it can happen that the replicated storage
	// at the follower have different updated value, but it's not becasue it is inconsistent, 
	// as the RAFT logs appears and the same operations are executed exactly in the same order
	const storage = server_1.leader ? storage_2 : storage_1;

	logger.debug(`Inserted values into replicated storage. Reply from server1: ${reply_1}, server2: ${reply_2}`);

	logger.debug(`Getting value from server1: ${storage_1.get('key')}`);
	logger.debug(`Getting value from server2: ${storage_2.get('key')}`);

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

