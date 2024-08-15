export type RemoteMapUpdateResult<K, V> = {
	inserted: [K, V][],
	updated: [K, oldvalue: V, newValue: V][],
}

export interface RemoteMap<K, V> {
	size(): Promise<number>;
	clear(): Promise<void>;
	keys(): Promise<IterableIterator<K>>;
	get(key: K): Promise<V | undefined>;
	getAll(keys: IterableIterator<K>): Promise<ReadonlyMap<K, V>>;
	set(key: K, value: V, callback?: (oldValue: V | undefined) => void): Promise<void>;
	setAll(entries: ReadonlyMap<K, V>, callback?: (result: RemoteMapUpdateResult<K, V>) => void): Promise<void>;
	remove(key: K): Promise<V | undefined>;
	removeAll(keys: IterableIterator<K>): Promise<ReadonlyMap<K, V>>;
	iterator(): AsyncIterableIterator<[K, V]>;
}
