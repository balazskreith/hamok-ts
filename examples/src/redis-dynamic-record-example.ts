import { Hamok, HamokConfig, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'record-insert-get-example',
	level: 'debug',
});
const publisher = new Redis();
const subscriber = new Redis();

type RoomSession = {
	lock: boolean | null;
	roomName: string;
}

const hamokConfig: Partial<HamokConfig> = {
	// we have 5s of expiration for logs, so snapshots are really matters
	logEntriesExpirationTimeInMs: 5000,
}

export async function run() {
	const server_1 = new Hamok(hamokConfig);
	const server_2 = new Hamok(hamokConfig);
	const server_3 = new Hamok(hamokConfig);
	const sessionId = Math.random().toString(36).substring(7);
	const roomName = `room ${sessionId}`;

	await subscriber.subscribe('hamok-channel');

	subscriber.on('messageBuffer', (channel, buffer) => {
		server_1.accept(HamokMessage.fromBinary(buffer));
		server_2.accept(HamokMessage.fromBinary(buffer));
		server_3.accept(HamokMessage.fromBinary(buffer));
	});

	server_1.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_2.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_3.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));

	logger.info('Creating a Room Record on server_1 and initializing it with { lock: null, clients: []" }');

	const roomConfig_1 = server_1.createRecord<RoomSession>({
		recordId: sessionId,
		initialObject: {
			lock: null,
			roomName,
		}
	});
	roomConfig_1.on('update', ({key, oldValue, newValue}) => logger.debug('roomConfig_1: %s changed from %s to %s', key, oldValue, newValue));

	await Promise.all([
		server_1.join(),
		server_2.join(),
		server_3.join(),
	]);

	logger.debug('Locking the room by server_1, and server_2 has a request to share the room');

	const [, roomConfig_2 ] = await Promise.all([
		roomConfig_1.set('lock', true),
		server_2.createRecord<RoomSession>({
			recordId: sessionId,
			initialObject: {
				lock: true,
				roomName,
			}
		}).ready,
	]);

	roomConfig_2.on('update', ({key, oldValue, newValue}) => logger.debug('roomConfig_2: %s changed from %s to %s', key, oldValue, newValue));
	
	logger.debug('The roomconfig on server_2 is initialized, and it has { lock: %s, roomName: %s }', roomConfig_2.get('lock'), roomConfig_2.get('roomName'));

	logger.info('Let\s see if two servers wants to change the roomName');
	let [ server1_success, server2_success ] = await Promise.all([
		roomConfig_1.updateIf('roomName', 'roomName chosed by server_1', roomConfig_1.get('roomName') ?? roomName),
		roomConfig_2.updateIf('roomName', 'roomName chosed by server_2', roomConfig_2.get('roomName') ?? roomName),
	]);

	logger.info('server_1 %s has %s to change the roomName', server_1.localPeerId, server1_success ? 'succeeded' : 'failed');
	logger.info('server_2 %s has %s to change the roomName', server_2.localPeerId, server2_success ? 'succeeded' : 'failed');
	logger.info('The room name is %s', roomConfig_1.get('roomName'));

	const [, roomConfig_3] = await Promise.all([
		roomConfig_2.set('lock', false),
		server_3.createRecord<RoomSession>({
			recordId: sessionId,
			initialObject: {
				lock: null,
				roomName,
			}
		}).ready,
	]);
	
	logger.debug('The roomconfig on server_3 is initialized, and it has { lock: %s, roomName: %s }', roomConfig_3.get('lock'), roomConfig_3.get('roomName'));

	roomConfig_3.on('update', ({key, oldValue, newValue}) => logger.debug('roomConfig_3: %s changed from %s to %s', key, oldValue, newValue));

	logger.debug(`Getting record from server3: { lock: %s, roomName: %s }`, roomConfig_3.get('lock'), roomConfig_3.get('roomName'));

	await roomConfig_3.set('roomName', 'roomName chosed by server_3');

	server_1.close();
	server_2.close();
	server_3.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

