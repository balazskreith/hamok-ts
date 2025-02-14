import { Hamok, HamokChannelEventMap, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'app-channel-example',
	level: 'debug',
});

interface ChannelEvents extends HamokChannelEventMap {
	'foo': (value: unknown) => void;
	'bar': (value: unknown) => Promise<number>;
}

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const server_3 = new Hamok();
	const messageHub = new HamokMessageHub();

	messageHub.add(server_1, server_2, server_3);
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
		server_3.join(),
	]);

	const channel_1 = server_1.createChannel<ChannelEvents>({
		channelId: 'my-channel',
	});
	const channel_2 = server_2.createChannel<ChannelEvents>({
		channelId: 'my-channel',
	});
	const channel_3 = server_3.createChannel<ChannelEvents>({
		channelId: 'my-channel',
	});

	await channel_1.subscribe('foo', (value) => {
		logger.info('Server_1 received foo event with value %o', value);
	});
	await channel_1.subscribe('bar', async (value) => {
		logger.info('Server_1 received bar event with value %o', value);
		return 42;
	});
	await channel_1.subscribe('bar', async (value) => {
		logger.info('Server_1 received bar event with value %o', value);
		return 43;
	});
	await channel_3.subscribe('foo', (value) => {
		logger.info('Server_3 received foo event with value %o', value);
	});


	const responses = await channel_2.request('bar', 'sadasd');
	logger.info('Server_2 received responses %o', responses);

	channel_1.notify('foo', 'bar');

	server_1.close();
	server_2.close();
	server_3.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

