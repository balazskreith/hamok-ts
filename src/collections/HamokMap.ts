import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { HamokConnection } from './HamokConnection';
import { BaseMap } from './BaseMap';
import * as Collections from '../common/Collections';
import { HamokMapSnapshot } from '../HamokSnapshot';

const logger = createLogger('HamokMap');

export type HamokMapEventMap<K, V> = {
	'insert': [key: K, value: V],
	'update': [key: K, oldValue: V, newValue: V],
	'remove': [key: K, value: V],
	'clear': [],
	'close': [],
}

/**
 * Replicated storage replicates all entries on all distributed storages
 */
export class HamokMap<K, V> extends EventEmitter<HamokMapEventMap<K, V>> {
	private _closed = false;
	public equalValues: (a: V, b: V) => boolean;

	public constructor(
		public readonly connection: HamokConnection<K, V>,
		public readonly baseMap: BaseMap<K, V>,
		equalValues?: (a: V, b: V) => boolean,
	) {
		super();
		this.setMaxListeners(Infinity);
		
		this.equalValues = equalValues ?? ((a, b) => {
			// logger.info('Comparing values: %o (%s), %o (%s)', a, b, JSON.stringify(a), JSON.stringify(b));
			return JSON.stringify(a) === JSON.stringify(b);
		});

		this.connection
			.on('ClearEntriesRequest', (request) => {
				this.baseMap.clear();
					
				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'ClearEntriesResponse', 
						request.createResponse(), 
						request.sourceEndpointId
					);
				}
					
				this.emit('clear');
			})
			.on('DeleteEntriesRequest', (request) => {
				const removedEntries = this.baseMap.removeAll(request.keys.values());

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'DeleteEntriesResponse', 
						request.createResponse(
							new Set(removedEntries.keys())
						), 
						request.sourceEndpointId
					);
				}
					
				removedEntries.forEach((v, k) => this.emit('remove', k, v));
			})
			.on('GetEntriesRequest', (request) => {
				// only requested by the sync process when the storage enters to the grid
				const foundEntries = this.baseMap.getAll(request.keys.values());

				this.connection.respond(
					'GetEntriesResponse',
					request.createResponse(foundEntries),
					request.sourceEndpointId
				);
			})
			.on('InsertEntriesRequest', (request) => {
				logger.debug('%s InsertEntriesRequest: %o, %s', this.connection.grid.localPeerId, request, [ ...request.entries ].join(', '));
				const existingEntries = this.baseMap.insertAll(request.entries);

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'InsertEntriesResponse',
						request.createResponse(existingEntries),
						request.sourceEndpointId
					);
				}

				request.entries.forEach((v, k) => existingEntries.has(k) || this.emit('insert', k, v));
			})
			.on('RemoveEntriesRequest', (request) => {
				const removedEntries = this.baseMap.removeAll(request.keys.values());

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'RemoveEntriesResponse',
						request.createResponse(
							removedEntries
						),
						request.sourceEndpointId
					);
				}

				removedEntries.forEach((v, k) => this.emit('remove', k, v));
			})
			.on('UpdateEntriesRequest', (request) => {

				logger.trace('%s UpdateEntriesRequest: %o, %s', this.connection.grid.localPeerId, request, [ ...request.entries ].join(', '));

				const updatedEntries: [K, V, V][] = [];
				const insertedEntries: [K, V][] = [];

				if (request.prevValue !== undefined) {
					// this is a conditional update
					if (request.entries.size !== 1) {
						// we let the request to timeout
						return logger.trace('Conditional update request must have only one entry: %o', request);
					}
					const [ key, value ] = [ ...request.entries ][0];

					const existingValue = this.baseMap.get(key);

					logger.trace('Conditional update request: %s, %s, %s, %s', key, value, existingValue, request.prevValue);

					if (existingValue && this.equalValues(existingValue, request.prevValue)) {
						this.baseMap.set(key, value);
						updatedEntries.push([ key, existingValue, value ]);
					}
				} else {
					this.baseMap.setAll(request.entries, ({ inserted, updated }) => {
						insertedEntries.push(...inserted);
						updatedEntries.push(...updated);
					});
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'UpdateEntriesResponse',
						request.createResponse(new Map<K, V>(updatedEntries.map(([ key, oldValue ]) => [ key, oldValue ]))),
						request.sourceEndpointId
					);
				}
				insertedEntries.forEach(([ key, value ]) => this.emit('insert', key, value));
				updatedEntries.forEach(([ key, oldValue, newValue ]) => this.emit('update', key, oldValue, newValue));
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
		if (this._closed) throw new Error(`Cannot clear a closed storage (${this.id})`);
		
		return this.connection.requestClearEntries();
	}

	public get(key: K): V | undefined {
		return this.baseMap.get(key);
	}

	public getAll(keys: IterableIterator<K> | K[]): ReadonlyMap<K, V> {
		if (this._closed) throw new Error(`Cannot get entries from a closed storage (${this.id})`);

		if (Array.isArray(keys)) return this.baseMap.getAll(keys.values());
		else return this.baseMap.getAll(keys);
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
    
	public [Symbol.iterator](): IterableIterator<[K, V]> {
		return this.baseMap[Symbol.iterator]();
	}

	/**
	 * Exports the storage data
	 */
	public export(): HamokMapSnapshot {
		const [ keys, values ] = this.connection.codec.encodeEntries(this.baseMap);
		const result: HamokMapSnapshot = {
			mapId: this.id,
			keys,
			values
		};

		return result;
	}

	public import(data: HamokMapSnapshot, eventing?: boolean) {
		if (data.mapId !== this.id) {
			throw new Error(`Cannot import data from a different storage: ${data.mapId} !== ${this.id}`);
		} else if (this.connection.connected) {
			throw new Error('Cannot import data while connected');
		} else if (this._closed) {
			throw new Error(`Cannot import data on a closed storage (${this.id})`);
		}

		const entries = this.connection.codec.decodeEntries(data.keys, data.values);

		this.baseMap.setAll(entries, ({ inserted, updated }) => {
			if (eventing) {
				inserted.forEach(([ key, value ]) => this.emit('insert', key, value));
				updated.forEach(([ key, oldValue, newValue ]) => this.emit('update', key, oldValue, newValue));
			}
		});
		
	}
}
