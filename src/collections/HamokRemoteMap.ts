import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { HamokConnection } from './HamokConnection';
import * as Collections from '../common/Collections';
import { ConcurrentExecutor } from '../common/ConcurrentExecutor';
import { RemoteMap } from './RemoteMap';

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
 * Replicated storage replicates all entries on all distributed storages
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class HamokRemoteMap<K, V> extends EventEmitter {
	private _closed = false;
	public equalValues: (a: V, b: V) => boolean;
	private readonly _executor = new ConcurrentExecutor(1);

	/**
	 * If the local endpoint is the leader, this is the commit index of the last executed operation
	 * when this local endpoint become the leader the pivoted commit index is loaded from the remote map
	 * and the local endpoint will execute all operations from above the pivoted commit index, but not below
	 * 
	 * IMPORTANT NOTE: pivotedCommitIndex must always be set only when the local endpoint is the leader, 
	 * and must be undefined when the local endpoint is not the leader
	 */
	private _pivotedCommitIndex?: number;

	/**
	 * This is for a transitional time when the endpoint become the leader until the point we fetched the pivoted commit index
	 */
	private _blockingPoint?: Promise<void>;

	private async _executeIfLeader<T>(supplier: () => Promise<T>, commitIndex?: number, onCompleted?: (input: T) => void) {
		if (this._closed) throw new Error(`Cannot execute on a closed storage (${this.id})`);
		if (this._blockingPoint) {
			// we are in a transitional period has to wait until the pivoted commit index is fetched
			await this._blockingPoint.catch(() => void 0);
		}

		if (this._pivotedCommitIndex === undefined) {
			// we only have pivoted Index if we are the leader
			return logger.trace('Pivoted commit index is not set for %s', this.id);
		} else if (commitIndex === undefined) {
			return logger.debug('Attempted to execute action without commitIndex for %s', this.id);
		} else if (this._pivotedCommitIndex !== undefined && commitIndex <= this._pivotedCommitIndex) {
			return logger.info('Attempted to execute action for a commit index already executed for %s. pivotCommitIndex: %d, commitIndex: %d', this.id, this._pivotedCommitIndex, commitIndex);
		}

		try {
			const input = await this._executor.execute(supplier);

			if (this._pivotedCommitIndex === undefined) {
				return logger.warn('Pivoted commit index become undefined, for %s, but operation is executed for commit index %d', this.id, commitIndex);
			}
			
			await this.remoteMap.setCommitIndex(commitIndex);
			if (this._pivotedCommitIndex === undefined) {
				return logger.warn('Pivoted commit index is not set for %s, but it is committed %d', this.id, commitIndex);
			}
			if (commitIndex <= this._pivotedCommitIndex) {
				logger.warn('Commit index is less than the pivoted commit index for %s. pivotCommitIndex: %d, commitIndex: %d', this.id, this._pivotedCommitIndex, commitIndex);
			}
			this._pivotedCommitIndex = commitIndex;
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
			.on('ClearEntriesRequest', (request, commitIndex) => {
				this._executeIfLeader(() => this.remoteMap.clear(), commitIndex, () => {
					this.connection.respond(
						'ClearEntriesResponse', 
						request.createResponse(), 
						request.sourceEndpointId
					);
					this.connection.notifyClearEntries(this.connection.grid.remotePeerIds);
					this.emit('clear');
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
					
					this.connection.notifyEntriesRemoved(removedEntries, this.connection.grid.remotePeerIds);
					removedEntries.forEach((v, k) => this.emit('remove', k, v));
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
					this.connection.notifyInsertEntries(insertedEntries, this.connection.grid.remotePeerIds);
					insertedEntries.forEach((value, key) => this.emit('insert', key, value));
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
					
					this.connection.notifyEntriesRemoved(removedEntries, this.connection.grid.remotePeerIds);
					removedEntries.forEach((v, k) => this.emit('remove', k, v));
				});
			})
			.on('EntriesRemovedNotification', (removedEntries) => removedEntries.entries.forEach((v, k) => this.emit('remove', k, v)))
			.on('UpdateEntriesRequest', (request, commitIndex) => {

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

					insertedEntries.forEach(([ key, value ]) => this.emit('insert', key, value));
					this.connection.notifyInsertEntries(new Map(insertedEntries), this.connection.grid.remotePeerIds);

					updatedEntries.forEach(([ key, oldValue, newValue ]) => {
						this.emit('update', key, oldValue, newValue);
						this.connection.notifyEntryUpdated(key, newValue, oldValue, this.connection.grid.remotePeerIds);
					});
				});
				
			})
			.on('leader-changed', (leaderId) => {
				if (leaderId !== this.connection.grid.localPeerId) {
					this._pivotedCommitIndex = undefined;

					return;
				}
				this._blockingPoint = new Promise((resolve) => {
					this.remoteMap.getCommitIndex()
						.then((commitIndex) => {
							this._pivotedCommitIndex = commitIndex;
							resolve();
						})
						.catch((err) => {
							logger.error('Error fetching commit index for %s. %o', this.id, err);
							resolve();
						});
				});

			})
			.once('close', () => this.close())
		;
	}

	public get id(): string {
		return this.connection.config.storageId;
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
}
