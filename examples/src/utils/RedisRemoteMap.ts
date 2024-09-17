import { Redis } from "ioredis";
import { RemoteMap } from "../../../lib";

export function createRedisRemoteMap<T>(mapId: string, publisher: Redis): RemoteMap<string, T> {
	return {
		async set(key, value, callback) {
			const oldValue = await publisher.hget(mapId, key);
			await publisher.hset(mapId, key, JSON.stringify(value));
			callback?.(oldValue ? JSON.parse(oldValue) : undefined);
		},
		async setAll(entries, callback) {
			const inserted: [string, T][] = [];
			const updated: [string, T, T][] = [];

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
					yield [key, value ? JSON.parse(value) : undefined] as [string, T];
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
			const iteratedKeys = [...keys];
			const values = await Promise.all(iteratedKeys.map((key) => publisher.hget(mapId, key)));
			const entries = iteratedKeys.map((key, index) => [key, values[index] ? JSON.parse(values[index]) : undefined]).filter(([, value]) => value !== undefined);

			return new Map(entries as [string, T][]);
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

			return new Map(entries as [string, T][]);
		},
		async clear() {
			return publisher.del(mapId).then(() => void 0);
		},
		async size() {
			return publisher.hlen(mapId);
		},
	};
}
