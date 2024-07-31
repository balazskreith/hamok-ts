import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { StorageConnection } from './StorageConnection';
import { ConcurrentExecutor } from '../common/ConcurrentExecutor';
import { BaseMap } from './BaseMap';
import * as Collections from '../common/Collections';

const logger = createLogger('ReplicatedStorage');

export type ReplicatedStorageEventMap<K, V> = {
	'insert': [key: K, value: V],
	'update': [key: K, value: V],
	'remove': [key: K, value: V],
	'clear': [],
	'close': [],
}

/**
 * Replicated storage replicates all entries on all distributed storages
 */
export class ReplicatedStorage<K, V> extends EventEmitter<ReplicatedStorageEventMap<K, V>> {
	private _standalone: boolean;
	private readonly _executor = new ConcurrentExecutor(1);
	private _closed = false;

	public constructor(
		public readonly connection: StorageConnection<K, V>,
		public readonly baseMap: BaseMap<K, V>,
		public equalValues: (a: V, b: V) => boolean = (a, b) => a === b,
		public equalKeys: (a: K, b: K) => boolean = (a, b) => a === b
	) {
		super();
		this._standalone = this.connection.grid.leaderId === undefined;

		this.connection
			.on('ClearEntriesRequest', (request) => {
				this._processRequest(async () => {
					this.baseMap.clear();
					this.connection.respond(
						'ClearEntriesResponse', 
						request.createResponse(), 
						request.sourceEndpointId
					);
					
					return Promise.resolve(this.emit('clear'));
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while clearing entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('DeleteEntriesRequest', (request) => {
				this._processRequest(async () => {
					const removedEntries = this.baseMap.removeAll(request.keys.values());

					this.connection.respond(
						'DeleteEntriesResponse', 
						request.createResponse(
							new Set(removedEntries.keys())
						), 
						request.sourceEndpointId
					);
					
					return Promise.resolve(
						removedEntries.forEach((v, k) => this.emit('remove', k, v))
					);
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while deleting entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('GetEntriesRequest', (request) => {
				// only requested by the sync process when the storage enters to the grid
				const foundEntries = this.baseMap.getAll(request.keys.values());

				return Promise.resolve(this.connection.respond(
					'GetEntriesResponse',
					request.createResponse(foundEntries),
					request.sourceEndpointId
				));
			})
			.on('InsertEntriesRequest', (request) => {
				this._processRequest(async () => {
					logger.debug('%s InsertEntriesRequest: %o, %s', this.connection.grid.localPeerId, request, [ ...request.entries ].join(', '));
					const existingEntries = this.baseMap.insertAll(request.entries);

					if (request.sourceEndpointId === this.connection.grid.localPeerId) {
						const response = request.createResponse(existingEntries);

						this.connection.respond(
							'InsertEntriesResponse',
							response,
							request.sourceEndpointId
						);
					}

					return Promise.resolve(
						request.entries.forEach((v, k) => existingEntries.has(k) || this.emit('insert', k, v))
					);
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while inserting entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('RemoveEntriesRequest', (request) => {
				this._processRequest(async () => {
					const removedEntries = this.baseMap.removeAll(request.keys.values());

					if (request.sourceEndpointId === this.connection.grid.localPeerId) {
						const response = request.createResponse(
							removedEntries
						);

						this.connection.respond(
							'RemoveEntriesResponse',
							response,
							request.sourceEndpointId
						);
					}

					return Promise.resolve(
						removedEntries.forEach((v, k) => this.emit('remove', k, v))
					);
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while removing entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('UpdateEntriesRequest', (request) => {
				this._processRequest(async () => {
					return Promise.resolve(this.baseMap.setAll(request.entries, ({ inserted, updated }) => {
						inserted.forEach(([ key, value ]) => this.emit('insert', key, value));
						updated.forEach(([ key, value ]) => this.emit('update', key, value));

						if (request.sourceEndpointId === this.connection.grid.localPeerId) {
							this.connection.respond(
								'UpdateEntriesResponse',
								request.createResponse(new Map<K, V>(updated)),
								request.sourceEndpointId
							);
						}
					}));
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while updating entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('leader-changed', (leaderId) => {
				this._processRequest(async () => {
					const wasAlone = this._standalone;

					this._standalone = leaderId === undefined;
    
					if (wasAlone && !this._standalone) {
						// become member of the grid
                        
						logger.info(`Storage ${this.id} is joining to the grid, clearing and setting all entries in the baseMap.`);
						const targetPeerIds = leaderId ? [ leaderId ] : undefined;
						const remoteEntries = await this.connection.requestGetEntries(Collections.setOf(...this.baseMap.keys()), targetPeerIds);
						const inserted: [K, V][] = [];
						const updated: [K, V][] = [];

						for (const [ key, value ] of remoteEntries) {
							const existingValue = this.baseMap.get(key);

							if (existingValue === undefined) {
								this.baseMap.set(key, value);
								inserted.push([ key, value ]);

								continue;
							}

							if (this.equalValues(existingValue, value)) continue;

							this.baseMap.set(key, value);
							updated.push([ key, value ]);
						}

						inserted.forEach(([ key, value ]) => this.emit('insert', key, value));
						updated.forEach(([ key, value ]) => this.emit('update', key, value));

					} else if (!wasAlone && this._standalone) {
						// going away from the grid, we don't have to do anything, only when we come back
					}
				}).catch((err) => logger.error('Error while joining to the grid: %s', `${err}`));
			})
			.once('close', () => this.close())
		;
	}

	public get id(): string {
		return this.connection.config.storageId;
	}

	public get shared(): boolean {
		return !this._standalone;
	}

	public get closed() {
		return this._closed;
	}

	public close(): void {
		if (this._closed) return;
		this._closed = true;

		this.connection.close();
		
		this.emit('close');
		this.removeAllListeners();
	}
    
	public get size() {
		return this.baseMap.size;
	}

	public get isEmpty() {
		return this.baseMap.size === 0;
	}

	public keys() {
		return this.baseMap.keys();
	}

	public async clear(): Promise<void> {
		if (this._standalone) {
			return this.baseMap.clear();
		}
		
		return this.connection.requestClearEntries();
	}

	public get(key: K): V | undefined {
		return this.baseMap.get(key);
	}

	public getAll(keys: IterableIterator<K> | K[]): ReadonlyMap<K, V> {
		if (Array.isArray(keys)) return this.baseMap.getAll(keys.values());
		else return this.baseMap.getAll(keys);
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

		return this.connection.requestUpdateEntries(entries);
	}
    
	public async insert(key: K, value: V): Promise<V | undefined> {
		const result = await this.insertAll(
			Collections.mapOf([ key, value ])
		);
        
		return result.get(key);
	}
    
	public async insertAll(entries: ReadonlyMap<K, V> | [K, V][]): Promise<ReadonlyMap<K, V>> {
		if (Array.isArray(entries)) {
			if (entries.length < 1) return Collections.emptyMap<K, V>();
			entries = Collections.mapOf(...entries);
		}

		if (entries.size < 1) {
			return Collections.emptyMap<K, V>();
		}
		if (this._standalone) {
			return this.baseMap.insertAll(entries);
		}

		return this.connection.requestInsertEntries(entries);
	}
    
	public async delete(key: K): Promise<boolean> {
		const result = await this.deleteAll(
			Collections.setOf(key)
		);
        
		return result.has(key);
	}
    
	public async deleteAll(keys: ReadonlySet<K> | K[]): Promise<ReadonlySet<K>> {
		if (Array.isArray(keys)) {
			if (keys.length < 1) return Collections.emptySet<K>();
			keys = Collections.setOf(...keys);
		}
		if (keys.size < 1) {
			return Collections.emptySet<K>();
		}
		if (this._standalone) {
			return Collections.setOf(
				...this.baseMap.deleteAll(keys.values())
			);
		}
		
		return this.connection.requestDeleteEntries(keys);
	}

	public async remove(key: K): Promise<boolean> {
		const result = await this.removeAll(
			Collections.setOf(key)
		);

		return result.has(key);
	}

	public async removeAll(keys: ReadonlySet<K> | K[]): Promise<ReadonlyMap<K, V>> {
		if (Array.isArray(keys)) {
			if (keys.length < 1) return Collections.emptyMap<K, V>();
			keys = Collections.setOf(...keys);
		}
		if (keys.size < 1) {
			return Collections.emptyMap<K, V>();
		}
		if (this._standalone) {
			return this.baseMap.removeAll(keys.values());
		}
        
		return this.connection.requestRemoveEntries(keys);
	}
    
	public [Symbol.iterator](): IterableIterator<[K, V]> {
		return this.baseMap[Symbol.iterator]();
	}

	private _processRequest<T>(fn: () => Promise<T>, options?: {
		requestId?: string,
		remotePeerId?: string,
		removeOngoingAfterDone?: boolean,
	}): Promise<T> {

		if (options?.remotePeerId && options?.requestId) {
			this.connection.grid.ongoingRequestsNotifier.add({
				requestId: options.requestId,
				remotePeerId: options.remotePeerId,
				storageId: this.id,
			});
		}
		
		return this._executor.execute(async () => {
			if (options?.requestId && !options.removeOngoingAfterDone) {
				this.connection.grid.ongoingRequestsNotifier.remove(options.requestId);
			}
			
			try {
				return await fn();
			} finally {
				if (options?.requestId && options.removeOngoingAfterDone) {
					this.connection.grid.ongoingRequestsNotifier.remove(options.requestId);
				}
			}
			
		});
	}
}