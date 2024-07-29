export type StorageEventMap<K, V> = {
	'insert': [key: K, value: V],
	'update': [key: K, value: V],
	'remove': [key: K, value: V],
	'clear': [],
}

export interface Storage<K, V> {

	on<U extends keyof StorageEventMap<K, V>>(event: U, listener: (...args: StorageEventMap<K, V>[U]) => void): this;
	once<U extends keyof StorageEventMap<K, V>>(event: U, listener: (...args: StorageEventMap<K, V>[U]) => void): this;
	off<U extends keyof StorageEventMap<K, V>>(event: U, listener: (...args: StorageEventMap<K, V>[U]) => void): this;

	/**
     * The identifer of the storage
     */
	readonly id: string;
    
	/**
     * The number of entries the storage has
     *
     * @return The number of entries the Storage has
     */
	size(): Promise<number>;

	/**
     * indicate if the storage is empty or not
     */
	isEmpty(): Promise<boolean>;

	/**
     * Gets all keys the storage stores
     */
	keys(): Promise<ReadonlySet<K>>;

	/**
     * Clear the storage and evict all entries
     */
	clear(): Promise<void>;

	/**
     * 
     * @param key the key tried to be accessed to in the storage
     * @returns the value of undefined if entry was not found
     */
	get(key: K): Promise<V | undefined>;

	/**
     * 
     * @param keys set of keys tried to be retrieved from the storage
     * @returns a map filled with key, value pair found in the storage
     */
	getAll(keys: ReadonlySet<K>): Promise<ReadonlyMap<K, V>>;
    
	set(key: K, value: V): Promise<V | undefined>;
	setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>>;

	insert(key: K, value: V): Promise<V | undefined>;
	insertAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>>;

	delete(key: K): Promise<boolean>;
	deleteAll(keys: ReadonlySet<K>): Promise<ReadonlySet<K>>;

	evict(key: K): Promise<void>;
	evictAll(keys: ReadonlySet<K>): Promise<void>;

	restore(key: K, value: V): Promise<void>;
	restoreAll(entries: ReadonlyMap<K, V>): Promise<void>;

	[Symbol.asyncIterator](): AsyncIterableIterator<[K, V]>;
}