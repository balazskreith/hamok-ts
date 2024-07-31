import { Hamok, setLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'replicated-storage-example',
	level: 'debug',
});


setLogLevel('debug');

const server_1 = new Hamok();
const server_2 = new Hamok();
// const server_3 = new Hamok();

server_1.on('message', server_2.accept.bind(server_2));
// server_1.on('message', server_3.accept.bind(server_3));
server_2.on('message', server_1.accept.bind(server_1));
// server_2.on('message', server_3.accept.bind(server_3));
// server_3.on('message', server_1.accept.bind(server_1));
// server_3.on('message', server_2.accept.bind(server_2));

server_1.addRemotePeerId(server_2.localPeerId);
// server_1.addRemotePeerId(server_3.localPeerId);
server_2.addRemotePeerId(server_1.localPeerId);
// server_2.addRemotePeerId(server_3.localPeerId);
// server_3.addRemotePeerId(server_1.localPeerId);
// server_3.addRemotePeerId(server_2.localPeerId);

server_1.start();
server_2.start();
// server_3.start();

(async () => {
	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	const storage_1 = server_1.createReplicatedStorage<string, number>({
		storageId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createReplicatedStorage<string, number>({
		storageId: 'my-replicated-storage',
	});
	// const storage_3 = server_3.createReplicatedStorage<string, number>({
	// 	storageId: 'my-replicated-storage',
	// });

	const value_1 = Math.random();
	const value_2 = Math.random();
	// const value_3 = Math.random();

	logger.debug(`Inserting values into replicated storage. Candidates to insert from server1: ${value_1}, server2: ${value_2}`);

	const [ reply_1, reply_2 ] = await Promise.all([
		storage_1.insert('key', value_1),
		storage_2.insert('key', value_2),
		// storage_3.insert('key', value_3),
	]).catch(err => {
		logger.error('Error inserting values into replicated storage: %s', `${err}`);
		throw err;
	});

	logger.debug(`Inserted values into replicated storage. Reply from server1: ${reply_1}, server2: ${reply_2}`);

	logger.debug(`Getting value from server1: ${storage_1.get('key')}`);
	logger.debug(`Getting value from server2: ${storage_2.get('key')}`);
})();


setTimeout(() => {
	server_1.stop();
	server_2.stop();
	// server_3.stop();
}, 30000)