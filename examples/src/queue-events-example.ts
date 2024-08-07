import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'queue-events-example',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	const producer = server_1.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	const consumer = server_2.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	
	consumer.on('empty', () => logger.info('Queue is empty'));
	consumer.on('not-empty', () => logger.info('Queue is not empty'));
	
	server_1.start();
	server_2.start();
	
	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');
	let value = 0;
	const producingTimer = setInterval(async () => {
		const value_1 = ++value;
		const value_2 = ++value;
		await Promise.all([
			producer.push(value_1),
			producer.push(value_2),
		]);
		logger.debug(`Pushed value into distributed queue ${value_1} and ${value_2}`);
	}, 1000);
	
	const consumingTimer_1 = setInterval(async () => {
		const value = await consumer.pop();
		logger.debug('Popped value from distributed queue on server_2 by consuming timer 1: %s', value ?? 'empty');
	}, 1000);
	
	const consumingTimer_2 = setInterval(async () => {
		const value = await consumer.pop();
		logger.debug('Popped value from distributed queue by on server_2 consuming timer 2: %s', value ?? 'empty');
	}, 1000);

	await new Promise(resolve => setTimeout(resolve, 10000));

	server_1.stop();
	server_2.stop();

	[
		producingTimer,
		consumingTimer_1,
		consumingTimer_2,
	].forEach(timer => clearInterval(timer));
}


if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}