import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'queue-events-example',
	level: 'debug',
});

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const messageHub = new HamokMessageHub();
	const producer = server_1.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	const consumer = server_2.createQueue<number>({
		queueId: 'my-distributed-queue',
	});
	
	consumer.on('empty', () => logger.info('Queue is empty'));
	consumer.on('not-empty', () => logger.info('Queue is not empty'));
	
	messageHub.add(server_1, server_2);
	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

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

	server_1.close();
	server_2.close();

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