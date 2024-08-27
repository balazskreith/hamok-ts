import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'record-insert-get-example',
	level: 'debug',
});

type MySharedConfig = {
	foo: string;
	bar: number;
}

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	const storage_1 = server_1.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
	});
	const storage_2 = server_2.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
	});

	logger.debug(`Inserting values into replicated record. Candidates to insert from server1: 1, server2: 2`);

	const [ reply_1, reply_2 ] = await Promise.all([
		storage_1.insert('bar', 1),
		storage_2.insert('bar', 2),
	]).catch(err => {
		logger.error('Error inserting values into replicated record: %s', `${err}`);
		throw err;
	});

	// we want to use the follower storage, becasue the leader storage get the 
	// faster than any of the follower, so it can happen that the replicated storage
	// at the follower have different updated value, but it's not becasue it is inconsistent, 
	// as the RAFT logs appears and the same operations are executed exactly in the same order
	const storage = server_1.leader ? storage_2 : storage_1;

	logger.debug(`Inserted values into replicated record. Reply from server1: ${reply_1}, server2: ${reply_2}`);

	logger.debug(`Getting value from server1: ${storage_1.get('bar')}`);
	logger.debug(`Getting value from server2: ${storage_2.get('bar')}`);

	logger.debug(`Updating value in replicated storage. We want to update the value to : 3`);
	
	await storage.set('bar', 3);

	logger.debug(`After updated getting value from server1: ${storage_1.get('bar')}`);
	logger.debug(`After updated getting value from server2: ${storage_2.get('bar')}`);

	logger.debug(`Deleting value from replicated storage`);

	await storage.delete('bar');

	logger.debug(`After deleted getting value from server1: ${storage_1.get('bar')}`);
	logger.debug(`After deleted getting value from server2: ${storage_2.get('bar')}`);

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

