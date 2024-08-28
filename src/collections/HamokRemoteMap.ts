import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { HamokConnection } from './HamokConnection';
import * as Collections from '../common/Collections';
import { ConcurrentExecutor } from '../common/ConcurrentExecutor';
import { RemoteMap } from './RemoteMap';
import { HamokRemoteMapSnapshot } from '../HamokSnapshot';

const logger = createLogger('HamokRemoteMap');

export type HamokRemoteMapEventMap<K, V> = {
	'insert': [key: K, value: V],
	'update': [key: K, oldValue: V, newValue: V],
	'remove': [key: K, value: V],
	'clear': [],
	'close': [],
}

export declare interface HamokRemoteMap<K, V> {
	on<U extends keyof HamokRemoteMapEventMap<K, V>>(event: U, listener: (...args: HamokRemoteMapEventMap<K, V>[U]) => void): this;
	off<U extends keyof HamokRemoteMapEventMap<K, V>>(event: U, listener: (...args: HamokRemoteMapEventMap<K, V>[U]) => void): this;
	once<U extends keyof HamokRemoteMapEventMap<K, V>>(event: U, listener: (...args: HamokRemoteMapEventMap<K, V>[U]) => void): this;
	emit<U extends keyof HamokRemoteMapEventMap<K, V>>(event: U, ...args: HamokRemoteMapEventMap<K, V>[U]): boolean;
}

/**
 * A remote map is a map that is stored on a remote endpoint and magaged by Hamok instances
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class HamokRemoteMap<K, V> extends EventEmitter {
	private _closed = false;
	public equalValues: (a: V, b: V) => boolean;
	private readonly _executor = new ConcurrentExecutor(1);

	/**
	 * Flag indicate if the storage emit events and notify other storage to emit events (if this is the leader)
	 */
	public emitEvents = true;

	private _initializing?: Promise<this>;

	/**
	 * The last commit index that was applied to the map
	 */
	private _appliedCommitIndex = -1;

	/**
	 * Whether this endpoint is the leader
	 */
	private _leader = false;

	/**
	 * 
	 * @param supplier the supplied action has to be executed if this endpoint is the leader
	 * @param commitIndex the commit index that the action is associated with
	 * @param onCompleted callback if this endpoint is the leader and the action is executed
	 * @returns 
	 */
	private async _executeIfLeader<T>(supplier: () => Promise<T>, commitIndex?: number, onCompleted?: (input: T) => void) {
		if (this._closed) throw new Error(`Cannot execute on a closed storage (${this.id})`);
		
		logger.trace('Executing action for %s, appliedCommitIndex: %d, commitIndex: %d', 
			this.id,
			this._appliedCommitIndex,
			commitIndex
		);

		if (commitIndex === undefined) {
			return logger.warn('Cannot execute action in storage %s becasue the provided commit index undefined', this.id);
		} else if (!this._leader) {
			return logger.trace('Not the leader for %s', this.id);
		}

		logger.trace('Executing action for %s, commitIndex: %d', this.id, commitIndex);

		try {
			const input = await this._executor.execute(supplier);

			if (commitIndex <= this._appliedCommitIndex) {
				logger.warn('Commit index is less than the applied commit index for %s. appliedCommitIndex: %d, commitIndex: %d', this.id, this._appliedCommitIndex, commitIndex);
			}
			this._appliedCommitIndex = commitIndex;

			onCompleted?.(input);
		} catch (err) {
			logger.error('Error executing on %s', this.id, err);
		}
	}

	public constructor(
		public readonly connection: HamokConnection<K, V>,
		public readonly remoteMap: RemoteMap<K, V>,
		equalValues?: (a: V, b: V) => boolean,
	) {
		super();
		this.setMaxListeners(Infinity);
		
		this.equalValues = equalValues ?? ((a, b) => {
			// logger.info('Comparing values: %o (%s), %o (%s)', a, b, JSON.stringify(a), JSON.stringify(b));
			return JSON.stringify(a) === JSON.stringify(b);
		});

		this.connection
			// StorageAppliedCommitNotification is deprecated in favor of StorageState which contains the applied commit index
			// .on('StorageAppliedCommitNotification', (notification) => {
			// 	if (!this._leader) {
			// 		this._appliedCommitIndex = notification.appliedCommitIndex;
			// 	}
			// })
			.on('ClearEntriesRequest', (request, commitIndex) => {
				this._executeIfLeader(() => this.remoteMap.clear(), commitIndex, () => {
					this.connection.respond(
						'ClearEntriesResponse', 
						request.createResponse(), 
						request.sourceEndpointId
					);

					if (this.emitEvents) {
						this.connection.notifyClearEntries(this.connection.grid.remotePeerIds);
						this.emit('clear');
					}
				});
			})
			.on('ClearEntriesNotification', () => this.emit('clear'))
			.on('DeleteEntriesRequest', (request, commitIndex) => {
				this._executeIfLeader(() => this.remoteMap.removeAll(request.keys.values()), commitIndex, (removedEntries) => {
					this.connection.respond(
						'DeleteEntriesResponse', 
						request.createResponse(
							new Set(removedEntries.keys())
						), 
						request.sourceEndpointId
					);
					
					if (this.emitEvents) {
						this.connection.notifyEntriesRemoved(removedEntries, this.connection.grid.remotePeerIds);
						removedEntries.forEach((v, k) => this.emit('remove', k, v));
					}
				});
			})
			.on('InsertEntriesRequest', (request, commitIndex) => {
				this._executeIfLeader(async () => {
					const existingEntries = await this.remoteMap.getAll(request.entries.keys());
					const insertedEntries = new Map<K, V>();

					for (const [ key, value ] of request.entries) {
						if (existingEntries.has(key)) {
							continue;
						}
						insertedEntries.set(key, value);
					}

					await this.remoteMap.setAll(request.entries);
					
					return insertedEntries;
				}, commitIndex, (insertedEntries) => {
					this.connection.respond(
						'InsertEntriesResponse',
						request.createResponse(new Map()),
						request.sourceEndpointId
					);

					if (this.emitEvents) {
						this.connection.notifyEntriesInserted(insertedEntries, this.connection.grid.remotePeerIds);
						insertedEntries.forEach((value, key) => this.emit('insert', key, value));
					}
				});
			})
			.on('EntriesInsertedNotification', (insertedEntries) => insertedEntries.entries.forEach((v, k) => this.emit('insert', k, v)))
			.on('RemoveEntriesRequest', (request, commitIndex) => {
				this._executeIfLeader(() => this.remoteMap.removeAll(request.keys.values()), commitIndex, (removedEntries) => {
					this.connection.respond(
						'RemoveEntriesResponse', 
						request.createResponse(
							removedEntries
						), 
						request.sourceEndpointId
					);
					
					if (this.emitEvents) {
						this.connection.notifyEntriesRemoved(removedEntries, this.connection.grid.remotePeerIds);
						removedEntries.forEach((v, k) => this.emit('remove', k, v));
					}
				});
			})
			.on('EntriesRemovedNotification', (removedEntries) => removedEntries.entries.forEach((v, k) => this.emit('remove', k, v)))
			.on('UpdateEntriesRequest', (request, commitIndex) => {
				// logger.warn('Accepting UpdateEntriesRequest %s, commitIndex: %d', request.requestId, commitIndex);
				this._executeIfLeader(async () => {
					logger.trace('%s UpdateEntriesRequest: %o, %s', this.connection.grid.localPeerId, request, [ ...request.entries ].join(', '));

					const updatedEntries: [K, V, V][] = [];
					const insertedEntries: [K, V][] = [];
	
					if (request.prevValue !== undefined) {
						// this is a conditional update
						if (request.entries.size !== 1) {
							// we let the request to timeout
							logger.trace('Conditional update request must have only one entry: %o', request);

							return { insertedEntries, updatedEntries };
						}
						const [ key, value ] = [ ...request.entries ][0];
	
						const existingValue = await this.remoteMap.get(key);
	
						logger.trace('Conditional update request: %s, %s, %s, %s', key, value, existingValue, request.prevValue);
	
						if (existingValue && this.equalValues(existingValue, request.prevValue)) {
							this.remoteMap.set(key, value);
							updatedEntries.push([ key, existingValue, value ]);
						}
					} else {
						await this.remoteMap.setAll(request.entries, ({ inserted, updated }) => {
							insertedEntries.push(...inserted);
							updatedEntries.push(...updated);
						});
					}

					return { insertedEntries, updatedEntries };
				}, commitIndex, ({ insertedEntries, updatedEntries }) => {
					this.connection.respond(
						'UpdateEntriesResponse',
						request.createResponse(new Map<K, V>(updatedEntries.map(([ key, oldValue ]) => [ key, oldValue ]))),
						request.sourceEndpointId
					);

					if (this.emitEvents) {
						insertedEntries.forEach(([ key, value ]) => this.emit('insert', key, value));
						this.connection.notifyEntriesInserted(new Map(insertedEntries), this.connection.grid.remotePeerIds);
	
						updatedEntries.forEach(([ key, oldValue, newValue ]) => {
							this.emit('update', key, oldValue, newValue);
							this.connection.notifyEntryUpdated(key, oldValue, newValue, this.connection.grid.remotePeerIds);
						});
					}
				});
				
			})
			.on('EntryUpdatedNotification', ({ key, newValue, oldValue }) => this.emit('update', key, oldValue, newValue))
			.on('leader-changed', (leaderId) => {
				// this is all we need to know
				this._leader = leaderId === this.connection.grid.localPeerId;
			})
			.on('StorageHelloNotification', (notification) => {
				// we only reply to it if this endpoint is the leader
				// if there is no leader in the grid the fetch on the remote endpoint should retry
				if (!this._leader) return;
				try {
					const snapshot = this.export();
					const serializedSnapshot = JSON.stringify(snapshot);
	
					this.connection.notifyStorageState(
						serializedSnapshot,
						// and this is the trick here since this storage is async.
						// the connection has it's own pace to emit commits, but we execute it async, so we need to know 
						// where this storage is at the moment. 
						this._appliedCommitIndex,
						notification.sourceEndpointId, 
					);
				} catch (err) {
					logger.error('Failed to send snapshot', err);
				}
			})
			.on('remote-snapshot', (serializedSnapshot, done) => {
				try {
					const snapshot = JSON.parse(serializedSnapshot) as HamokRemoteMapSnapshot;

					this._import(
						snapshot, 
					);
				} catch (err) {
					logger.error(`Failed to import to record ${this.id}. Error: ${err}`);
				} finally {
					done();
				}
			})
			.once('close', () => this.close())
		;

		this._initializing = new Promise((resolve) => setTimeout(resolve, 20))
			.then(() => this.connection.join())
			.then(() => this)
			.catch((err) => {
				logger.error('Error while initializing remote map', err);

				return this;
			})
			.finally(() => (this._initializing = undefined));
	}

	public get id(): string {
		return this.connection.config.storageId;
	}

	public get ready(): Promise<this> {
		return this._initializing ?? this.connection.grid.waitUntilCommitHead().then(() => this);
	}

	public get closed() {
		return this._closed;
	}

	public close(): void {
		if (this._closed) return;
		this._closed = true;

		this.connection.close();
		
		if (this.emitEvents) {
			this.emit('close');
		}
		this.removeAllListeners();
	}
    
	public size() {
		return this.remoteMap.size();
	}

	public async isEmpty(): Promise<boolean> {
		return await this.remoteMap.size() === 0;
	}

	public keys() {
		return this.remoteMap.keys();
	}

	public async clear(): Promise<void> {
		if (this._closed) throw new Error(`Cannot clear a closed storage (${this.id})`);
		
		return this.connection.requestClearEntries();
	}

	public async get(key: K): Promise<V | undefined> {
		if (this._closed) throw new Error(`Cannot get entries from a closed storage (${this.id})`);
		
		return this.remoteMap.get(key);
	}

	public async getAll(keys: IterableIterator<K> | K[]): Promise<ReadonlyMap<K, V>> {
		if (this._closed) throw new Error(`Cannot get entries from a closed storage (${this.id})`);

		if (Array.isArray(keys)) return this.remoteMap.getAll(keys.values());
		else return this.remoteMap.getAll(keys);
	}
    
	public async set(key: K, value: V): Promise<V | undefined> {
		if (this._closed) throw new Error(`Cannot set an entry on a closed storage (${this.id})`);

		const result = await this.setAll(
			Collections.mapOf([ key, value ])
		);
        
		return result.get(key);
	}
    
	public async setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>> {
		if (this._closed) throw new Error(`Cannot set entries on a closed storage (${this.id})`);

		if (entries.size < 1) {
			return Collections.emptyMap<K, V>();
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
		if (this._closed) throw new Error(`Cannot insert entries on a closed storage (${this.id})`);

		if (Array.isArray(entries)) {
			if (entries.length < 1) return Collections.emptyMap<K, V>();
			entries = Collections.mapOf(...entries);
		}

		if (entries.size < 1) {
			return Collections.emptyMap<K, V>();
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
		if (this._closed) throw new Error(`Cannot delete entries on a closed storage (${this.id})`);

		if (Array.isArray(keys)) {
			if (keys.length < 1) return Collections.emptySet<K>();
			keys = Collections.setOf(...keys);
		}
		if (keys.size < 1) {
			return Collections.emptySet<K>();
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
		if (this._closed) throw new Error(`Cannot remove entries on a closed storage (${this.id})`);

		if (Array.isArray(keys)) {
			if (keys.length < 1) return Collections.emptyMap<K, V>();
			keys = Collections.setOf(...keys);
		}
		if (keys.size < 1) {
			return Collections.emptyMap<K, V>();
		}
        
		return this.connection.requestRemoveEntries(keys);
	}

	public async updateIf(key: K, value: V, oldValue: V): Promise<boolean> {
		if (this._closed) throw new Error(`Cannot update an entry on a closed storage (${this.id})`);

		logger.trace('%s UpdateIf: %s, %s, %s', this.connection.grid.localPeerId, key, value, oldValue);
		
		return (await this.connection.requestUpdateEntries(
			Collections.mapOf([ key, value ]),
			undefined,
			oldValue
		)).get(key) !== undefined;
	}
    
	public iterator(): AsyncIterableIterator<[K, V]> {
		return this.remoteMap.iterator();
	}

	/**
	 * Exports the storage data
	 */
	public export(): HamokRemoteMapSnapshot {
		if (this._closed) {
			throw new Error(`Cannot export data on a closed storage (${this.id})`);
		}
		const result: HamokRemoteMapSnapshot = {
			mapId: this.id,
			appliedCommitIndex: this._appliedCommitIndex,
		};

		return result;
	}

	public import(data: HamokRemoteMapSnapshot) {
		if (data.mapId !== this.id) {
			throw new Error(`Cannot import data from a different storage: ${data.mapId} !== ${this.id}`);
		} else if (this.connection.connected) {
			throw new Error('Cannot import data while connected');
		} else if (this._closed) {
			throw new Error(`Cannot import data on a closed storage (${this.id})`);
		}
	}

	private _import(snapshot: HamokRemoteMapSnapshot) {
		if (this._closed) {
			throw new Error(`Cannot import data on a closed storage (${this.id})`);
		}
		this._appliedCommitIndex = snapshot.appliedCommitIndex;
	}
}
