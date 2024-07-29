import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { Storage, StorageEventMap } from '../storages/Storage';
import { StorageConnection } from './StorageConnection';
import { ConcurrentExecutor } from '../common/ConcurrentExecutor';
import { BaseMap } from './BaseMap';

const logger = createLogger('ReplicatedStorage');

/**
 * Replicated storage replicates all entries on all distributed storages
 */
export class ReplicatedStorage<K, V> extends EventEmitter<StorageEventMap<K, V>> implements Storage<K, V> {
	private _standalone: boolean;
	private readonly _executor = new ConcurrentExecutor(1);
	public constructor(
		public readonly connection: StorageConnection<K, V>,
		public readonly baseMap: BaseMap<K, V>,
	) {
		super();
		this._standalone = this.connection.remotePeers.size < 1;

		this.connection
			.on('ClearEntriesRequest', (request) => {
				this._processRequest(async () => {
					this.baseMap.clear();
					this.connection.respond('ClearEntriesResponse', request.createResponse(), request.sourceEndpointId);
					
					return Promise.resolve(this.emit('clear'));
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				});
			})
			.on('DeleteEntriesRequest', (request) => {
				this._processRequest(async () => {
					const deletedKeys = this.baseMap.deleteAll(request.keys);

					this.connection.respond('ClearEntriesResponse', request.createResponse(deletedKeys), request.sourceEndpointId);
					
					return Promise.resolve(this.emit('remove'));
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				});
			})
			.on('GetEntriesRequest', (request) => {
                
			})
			.on('InsertEntriesRequest', (request) => {
                
			})
			.on('RemoveEntriesRequest', (request) => {
                
			})
			.on('UpdateEntriesRequest', (request) => {

			})
			.on('leader-changed', (leaderId) => {
				if (leaderId === undefined) {
					return;
				}
				const wasAlone = this._standalone;

				if (!wasAlone) return;
				if (this._executor.isBusy) {
					this._executor.onIdle(() => {
						logger.info(`Storage ${this.id} is joining to the grid`);
						this._standalone = false;
						this._clearAndSetAllEntries();
					});
				} else {
					logger.info(`Storage ${this.id} is joining to the grid`);
					this._standalone = false;
					this._clearAndSetAllEntries();
				}
			})
		;
	}

	private _clearAndSetAllEntries(): Promise<void> {
		return this.baseMap.keys()
			.then((keys) => this.baseMap.getAll(keys))
			.then((entries) => new Promise<void>((resolve) => {
				this.baseMap.clear()
					.then(() => this.setAll(entries))
					.then(() => resolve());
			}));
	}

	public get id(): string {
		return this.baseMap.id;
	}
    
	public async size(): Promise<number> {
		return this.baseMap.size();
	}

	public async isEmpty(): Promise<boolean> {
		return this.baseMap.isEmpty();
	}

	public async keys(): Promise<ReadonlySet<K>> {
		return this.baseMap.keys();
	}

	public async clear(): Promise<void> {
		if (this._standalone) {
			return this.baseMap.clear();
		}
		
		return this.connection.requestClearEntries();
	}

	public async get(key: K): Promise<V | undefined> {
		return this.baseMap.get(key);
	}

	public async getAll(keys: ReadonlySet<K>): Promise<ReadonlyMap<K, V>> {
		return this.baseMap.getAll(keys);
	}
    
	public async set(key: K, value: V): Promise<V | undefined> {
		const result = await this.setAll(
			Collections.mapOf([ key, value ])
		);
        
		return result.get(key);
	}
    
	public async setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		if (entries.size < 1) {
			return Collections.emptyMap<K, V>();
		}
		if (this._standalone) {
			return this.baseMap.setAll(entries);
		}
		const requests = Collections.splitMap<K, V>(
			entries,
			Math.min(this.config.maxKeys, this.config.maxValues)
		).map((batchedEntries) => this.connection.requestUpdateEntries(
			batchedEntries,
			Collections.setOf(this.connection.localEndpointId)
		));
        
		return Collections.concatMaps(
			new Map<K, V>(),
			...(await Promise.all(requests))
		);
	}
    
	public async insert(key: K, value: V): Promise<V | undefined> {
		const result = await this.insertAll(
			Collections.mapOf([ key, value ])
		);
        
		return result.get(key);
	}
    
	public async insertAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		if (entries.size < 1) {
			return Collections.emptyMap<K, V>();
		}
		if (this._standalone) {
			return this.baseMap.insertAll(entries);
		}
		const requests = Collections.splitMap<K, V>(
			entries,
			Math.min(this.config.maxKeys, this.config.maxValues)
		).map((batchedEntries) => this.connection.requestInsertEntries(
			batchedEntries,
			Collections.setOf(this.connection.localEndpointId)
		));
        
		return Collections.concatMaps(
			new Map<K, V>(),
			...(await Promise.all(requests))
		);
	}
    
	public async delete(key: K): Promise<boolean> {
		const result = await this.deleteAll(
			Collections.setOf(key)
		);
        
		return result.has(key);
	}
    
	public async deleteAll(keys: ReadonlySet<K>): Promise<ReadonlySet<K>> {
		if (keys.size < 1) {
			return Collections.emptySet<K>();
		}
		if (this._standalone) {
			return this.baseMap.deleteAll(keys);
		}
		const requests = Collections.splitSet<K>(
			keys,
			Math.min(this.config.maxKeys, this.config.maxValues)
		).map((batchedEntries) => this.connection.requestDeleteEntries(
			batchedEntries,
			Collections.setOf(this.connection.localEndpointId)
		));
        
		return Collections.concatSet<K>(
			new Set<K>(),
			...(await Promise.all(requests))
		);
	}
    
	public async evict(key: K): Promise<void> {
		return this.evictAll(
			Collections.setOf(key)
		);
	}
    
	public async evictAll(keys: ReadonlySet<K>): Promise<void> {
		if (keys.size < 1) {
			return;
		}
		if (this._standalone) {
			return this.baseMap.evictAll(keys);
		}
		const requests = Collections.splitSet<K>(
			keys,
			Math.min(this.config.maxKeys, this.config.maxValues)
		).map((batchedEntries) => this.connection.requestDeleteEntries(
			batchedEntries,
			Collections.setOf(this.connection.localEndpointId)
		));

		await Promise.all(requests);
	}
    
	public async restore(key: K, value: V): Promise<void> {
		return this.restoreAll(
			Collections.mapOf([ key, value ])
		);
	}
    
	public async restoreAll(entries: ReadonlyMap<K, V>): Promise<void> {
		if (entries.size < 1) {
			return;
		}
		if (this._standalone) {
			return this.baseMap.restoreAll(entries);
		}
		throw new Error('Not implemented');
		// const requests = Collections.splitMap<K, V>(
		//     entries,
		//     Math.min(this.config.maxKeys, this.config.maxValues)
		// ).map(batchedEntries => this._comlink.r(
		//     batchedEntries,
		//     Collections.setOf(this._comlink.localEndpointId)
		// ));
		// await Promise.all(requests);
	}
    
	public async *[Symbol.asyncIterator](): AsyncIterableIterator<[K, V]> {
		const iterator = this.baseMap[Symbol.asyncIterator]();

		for await (const entry of iterator) {
			yield entry;
		}
	}

	private _processRequest<T>(fn: () => Promise<T>, options?: {
		requestId?: string,
		remotePeerId?: string,
		removeOngoingAfterDone?: boolean,
	}): Promise<T> {

		if (options?.remotePeerId && options?.requestId) {
			this.connection.ongoingRequestsNotifier.add({
				requestId: options.requestId,
				remotePeerId: options.remotePeerId,
				storageId: this.id,
			});
		}
		
		return this._executor.execute(async () => {
			if (options?.requestId && !options.removeOngoingAfterDone) {
				this.connection.ongoingRequestsNotifier.remove(options.requestId);
			}
			
			try {
				return await fn();
			} finally {
				if (options?.requestId && options.removeOngoingAfterDone) {
					this.connection.ongoingRequestsNotifier.remove(options.requestId);
				}
			}
			
		});
	}
}