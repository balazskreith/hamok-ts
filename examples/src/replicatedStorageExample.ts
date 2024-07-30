import { Hamok, setLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

// const logger = pino.pino({
// 	name: 'fin-service',
// 	level: 'debug',
// });

setLogLevel('debug');

const server_1 = new Hamok();
const server_2 = new Hamok();

server_1.on('message', server_2.accept.bind(server_2));
server_2.on('message', server_1.accept.bind(server_1));

server_1.addRemotePeerId(server_2.localPeerId);
server_2.addRemotePeerId(server_1.localPeerId);

server_1.start();
server_2.start();

server_1.once('leader-changed', async () => {
	const storage_1 = server_1.createReplicatedStorage<string, number>({
		storageId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createReplicatedStorage<string, number>({
		storageId: 'my-replicated-storage',
	});

	await Promise.all([
		storage_1.insert('one', 1),
		storage_2.insert('one', 1),
	]);
})



setTimeout(() => {
	server_1.stop();
	server_2.stop();
}, 30000)