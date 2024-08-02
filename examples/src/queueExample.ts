import { createNumberToUint8ArrayCodec, Hamok, setLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'distributed-queue-example',
	level: 'debug',
});


setLogLevel('info');

const server_1 = new Hamok();
const server_2 = new Hamok();

server_1.on('message', server_2.accept.bind(server_2));
server_2.on('message', server_1.accept.bind(server_1));

server_1.addRemotePeerId(server_2.localPeerId);
server_2.addRemotePeerId(server_1.localPeerId);

server_1.start();
server_2.start();

(async () => {
	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	const queue_1 = server_1.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	const queue_2 = server_2.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	// const storage_3 = server_3.createReplicatedStorage<string, number>({
	// 	storageId: 'my-replicated-storage',
	// });

	const value_1 = Math.random();
	const value_2 = Math.random();

	logger.debug(`Pushing values into distributed queue. Candidates to push from server1: ${value_1}, server2: ${value_2}`);

	await Promise.all([
		queue_1.push(value_1),
		queue_2.push(value_2),
	]).catch(err => {
		logger.error('Error pushing values into distributed queue: %s', `${err}`);
		throw err;
	});

	const [ popppedValue_1, popppedValue_2 ] = await Promise.all([
		queue_1.pop(),
		queue_2.pop(),
	]).catch(err => {
		logger.error('Error popping values into distributed queue: %s', `${err}`);
		throw err;
	});

	logger.debug('First round of popped values from distributed queue by server_1: %s, server_2: %s', popppedValue_1 ?? 'empty', popppedValue_2 ?? 'empty');

	const [ popppedValue_3, popppedValue_4 ] = await Promise.all([
		queue_1.pop(),
		queue_2.pop(),
	]).catch(err => {
		logger.error('Error popping values into distributed queue: %s', `${err}`);
		throw err;
	});

	logger.debug('Second round of popped values from distributed queue by server_1: %s, server_2: %s', popppedValue_3 ?? 'empty', popppedValue_4 ?? 'empty');

})();


setTimeout(() => {
	server_1.stop();
	server_2.stop();
}, 30000)