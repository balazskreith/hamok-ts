import { Hamok, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';
import { createRedisRemoteMap } from './utils/RedisRemoteMap';

const logger = pino.pino({
	name: 'redis-remote-map-example',
	level: 'debug',
});;

export type CachedItem = {
	id: string;
	value: string
}

const server_1 = new Hamok();
const server_2 = new Hamok();
export const publisher = new Redis();
const subscriber = new Redis();
const mapId = 'cached-items' + Math.random();
const cache_1 = server_1.createRemoteMap<string, CachedItem>({
	mapId,
	remoteMap: createRedisRemoteMap<CachedItem>(mapId, publisher),
});
const cache_2 = server_2.createRemoteMap<string, CachedItem>({
	mapId,
	remoteMap: createRedisRemoteMap<CachedItem>(mapId, publisher),
});


export async function run() {
	setHamokLogLevel('warn');
	// let's just clear the map on start
	await subscriber.subscribe('hamok-channel');

	subscriber.on('messageBuffer', (channel, buffer) => {
		server_1.accept(HamokMessage.fromBinary(buffer));
		server_2.accept(HamokMessage.fromBinary(buffer));
	});

	server_1.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));
	server_2.on('message', message => publisher.publish('hamok-channel', Buffer.from(message.toBinary())));

	cache_1
		.on('clear', () => logger.info('Cache on server_1 is cleared'))
		.on('update', (key, oldValue, newValue) => logger.info(`Cache on server_1 is updated for ${key}, from ${oldValue.value} => ${newValue.value}`))
		.on('insert', (key, value) => logger.info(`Cache on server_1 is inserted for ${key}, with value ${value.value}`))
		.on('remove', (key, value) => logger.info(`Cache on server_1 is removed for ${key}, with value ${value.value}`))
		.on('close', () => logger.info('Cache on server_1 is closed'));

	cache_2
		.on('clear', () => logger.info('Cache on server_2 is cleared'))
		.on('update', (key, oldValue, newValue) => logger.info(`Cache on server_2 is updated for ${key}, from ${oldValue.value} => ${newValue.value}`))
		.on('insert', (key, value) => logger.info(`Cache on server_2 is inserted for ${key}, with value ${value.value}`))
		.on('remove', (key, value) => logger.info(`Cache on server_2 is removed for ${key}, with value ${value.value}`))
		.on('close', () => logger.info('Cache on server_2 is closed'));

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	logger.info('Servers joined');

	await cache_1.set('foo', { id: 'foo', value: 'bar' });
	await cache_2.set('foo', { id: 'foo', value: 'baz' });

	logger.info(`Getting cache on server_1 for foo: %o`, await cache_1.get('foo'));

	const removedValue = await cache_1.remove('foo');

	logger.info(`Removed value on server_1 for foo: %o`, removedValue);

	await cache_2.set('foo', { id: 'foo', value: 'bazz' });

	await cache_1.clear();
	await cache_2.clear();
	
	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

