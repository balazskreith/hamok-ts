import { Hamok, HamokMessage, setHamokLogLevel } from 'hamok';
import { RemoteMap } from 'hamok/lib/collections/RemoteMap';
import Redis from 'ioredis';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'redis-remote-map-example',
	level: 'debug',
});;

type CachedItem = {
	id: string;
	value: string
}

const server_1 = new Hamok();
const server_2 = new Hamok();
const publisher = new Redis();
const subscriber = new Redis();
const mapId = 'cached-items' + Math.random();
const cache_1 = server_1.createRemoteMap<string, CachedItem>({
	mapId,
	remoteMap: createRemoteMap(mapId),
});
const cache_2 = server_2.createRemoteMap<string, CachedItem>({
	mapId,
	remoteMap: createRemoteMap(mapId),
});


async function run() {
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
	
	server_1.stop();
	server_2.stop();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

function createRemoteMap(mapId: string): RemoteMap<string, CachedItem> {
	return {
		async set(key, value, callback) {
			const oldValue = await publisher.hget(mapId, key);
			await publisher.hset(mapId, key, JSON.stringify(value));
			callback?.(oldValue ? JSON.parse(oldValue) : undefined);
		},
		async setAll(entries, callback) {
			const inserted: [string, CachedItem][] = [];
			const updated: [string, CachedItem, CachedItem][] = [];

			for (const [key, value] of entries) {
				const oldValue = await publisher.hget(mapId, key);
				if (oldValue) {
					updated.push([key, JSON.parse(oldValue), value]);
				} else {
					inserted.push([key, value]);
				}
				await publisher.hset(mapId, key, JSON.stringify(value));
			}

			callback?.({ inserted, updated });
		},
		iterator() {
			async function* asyncIterator() {
				const keys = await publisher.hkeys(mapId);
				for (const key of keys) {
					const value = await publisher.hget(mapId, key);
					yield [key, value ? JSON.parse(value) : undefined] as [string, CachedItem];
				}
			}

			return asyncIterator();
		},
		async get(key) {
			const value = await publisher.hget(mapId, key);
			return value ? JSON.parse(value) : undefined;
		},
		async keys() {
			return (await publisher.hkeys(mapId)).values();
		},
		async getAll(keys) {
			const iteratedKeys = [...keys]
			const values = await Promise.all(iteratedKeys.map((key) => publisher.hget(mapId, key)));
			const entries = iteratedKeys.map((key, index) => [key, values[index] ? JSON.parse(values[index]) : undefined]).filter(([, value]) => value !== undefined);	
			
			return new Map(entries as [string, CachedItem][]);
		},
		async remove(key) {
			const value = await publisher.hget(mapId, key);
			await publisher.hdel(mapId, key);

			return value ? JSON.parse(value) : undefined;
		},
		async removeAll(keys) {
			const iteratedKeys = [...keys];
			const values = await Promise.all(iteratedKeys.map((key) => publisher.hget(mapId, key)));
			const entries = iteratedKeys.map((key, index) => [key, values[index] ? JSON.parse(values[index]) : undefined]).filter(([, value]) => value !== undefined);
			await publisher.hdel(mapId, ...iteratedKeys);

			return new Map(entries as [string, CachedItem][]);
		},
		async clear() {
			return publisher.del(mapId).then(() => void 0);
		},
		async size() {
			return publisher.hlen(mapId);
		},
	}
}