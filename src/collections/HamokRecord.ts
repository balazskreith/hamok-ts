import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { HamokConnection } from './HamokConnection';
import * as Collections from '../common/Collections';
import { HamokRecordSnapshot } from '../HamokSnapshot';
import { HamokCodec } from '../common/HamokCodec';

const logger = createLogger('HamokMap');

export type HamokRecordObject = Record<string, unknown>;

type InsertRemovePayload<T, K extends keyof T> = {
	key: K;
	value: T[K];
}

type UpdatePayload<T, K extends keyof T> = {
	key: K;
	oldValue: T[K];
	newValue: T[K];
}

export type HamokRecordEventMap<T> = {
	'insert': [InsertRemovePayload<T, keyof T>],
	'update': [UpdatePayload<T, keyof T>],
	'remove': [InsertRemovePayload<T, keyof T>],
	'clear': [],
	'close': [],
}

/**
 * Replicated storage replicates all entries on all distributed storages
 */
export class HamokRecord<T extends HamokRecordObject> extends EventEmitter<HamokRecordEventMap<T>> {
	private _payloadsCodec?: Map<keyof T, HamokCodec<T[keyof T], string>>;
	private _closed = false;
	public equalValues: <K extends keyof T>(a: T[K], b: T[K]) => boolean;
	private _object: Partial<T>;

	public constructor(
		public readonly connection: HamokConnection<string, string>, 
		setup?: {
			equalValues?: <K extends keyof T>(a: T[K], b: T[K]) => boolean,
			payloadsCodec?: Map<keyof T, HamokCodec<T[keyof T], string>>,
			initalObject?: Partial<T>,
		}
		
	) {
		super();
		this.equalValues = setup?.equalValues ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b));
		this._object = setup?.initalObject ?? {} as T;
		this._payloadsCodec = setup?.payloadsCodec;

		this.connection
			.on('ClearEntriesRequest', (request) => {
				this._object = {} as T;
					
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
				const removedEntries = new Map<string, string>();

				for (const key of request.keys) {
					const value = this._object[key];

					if (value === undefined) continue;

					delete this._object[key];
					this.emit('remove', {
						key,
						value,
					});
					const encodedValue = this._encodeValue(key, value);

					removedEntries.set(key, encodedValue);
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'DeleteEntriesResponse', 
						request.createResponse(
							new Set(removedEntries.keys())
						), 
						request.sourceEndpointId
					);
				}
			})
			.on('InsertEntriesRequest', (request) => {
				const existingEntries = new Map<string, string>();

				for (const [ key, encodedValue ] of request.entries) {
					const value = this._object[key];

					if (value !== undefined) {
						existingEntries.set(key, this._encodeValue(key, value));
						continue;
					}

					const decodedValue = this._decodeValue(key, encodedValue);

					this._object[key as keyof T] = decodedValue;
					
					this.emit('insert', {
						key,
						value: decodedValue,
					});
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'InsertEntriesResponse',
						request.createResponse(existingEntries),
						request.sourceEndpointId
					);
				}

				request.entries.forEach((v, k) => existingEntries.has(k) || this.emit('insert', { key: k, value: this._decodeValue(k, v) }));
			})
			.on('UpdateEntriesRequest', (request) => {

				const updatedEntries: [keyof T, T[keyof T], T[keyof T]][] = [];
				const insertedEntries: [keyof T, T[keyof T]][] = [];

				if (request.prevValue !== undefined) {
					// this is a conditional update
					if (request.entries.size !== 1) {
						// we let the request to timeout
						return logger.trace('Conditional update request must have only one entry: %o', request);
					}
					const [ key, encodedNewValue ] = [ ...request.entries ][0];
					const newValue = this._decodeValue(key, encodedNewValue);
					const prevValue = this._decodeValue(key, request.prevValue);
					const existingValue = this._object[key];

					logger.trace('Conditional update request: %s, %s, %s, %s', key, newValue, existingValue, prevValue);

					if (existingValue && this.equalValues(existingValue, prevValue)) {
						this._object[key as keyof T] = newValue;
						updatedEntries.push([ key, existingValue, newValue ]);
					}
				} else {

					for (const [ key, encodedValue ] of request.entries) {
						const existingValue = this._object[key];
						const decodedNewValue = this._decodeValue(key, encodedValue);
						
						if (existingValue === undefined) {
							insertedEntries.push([ key, this._decodeValue(key, encodedValue) ]);
						} else {
							updatedEntries.push([ key, existingValue, decodedNewValue ]);
						}

						this._object[key as keyof T] = decodedNewValue;
					}
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'UpdateEntriesResponse',
						request.createResponse(new Map<string, string>(
							updatedEntries.map(([ key, oldValue ]) => [ key as string, this._encodeValue(key, oldValue) ]))
						),
						request.sourceEndpointId
					);
				}
				insertedEntries.forEach(([ key, value ]) => this.emit('insert', { key, value }));
				updatedEntries.forEach(([ key, oldValue, newValue ]) => this.emit('update', { key, oldValue, newValue }));
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

	public async clear(): Promise<void> {
		if (this._closed) throw new Error(`Cannot clear a closed storage (${this.id})`);
		
		return this.connection.requestClearEntries();
	}
	
	public get<K extends keyof T>(key: K): T[K] | undefined {
		const result = this._object[key];

		if (result === undefined) return;

		return Object.freeze(result) as T[K];
	}

	public async set<K extends keyof T>(key: K, value: T[K]): Promise<T[K] | undefined> {
		if (this._closed) throw new Error(`Cannot set an entry on a closed storage (${this.id})`);

		const entries = new Map<string, string>([
			[ key as string, this._encodeValue(key, value) ]
		]);

		const respondedValue = (await this.connection.requestUpdateEntries(entries)).get(key as string);

		if (!respondedValue) return;

		return this._decodeValue(key as string, respondedValue) as T[K];
	}

	public async insert<K extends keyof T>(key: K, value: T[K]): Promise<T[K] | undefined> {
		if (this._closed) throw new Error(`Cannot set an entry on a closed storage (${this.id})`);

		const entries = new Map<string, string>([
			[ key as string, this._encodeValue(key, value) ]
		]);

		const respondedValue = (await this.connection.requestInsertEntries(entries)).get(key as string);

		if (!respondedValue) return;

		return this._decodeValue(key as string, respondedValue) as T[K];
	}

	public async updateIf<K extends keyof T>(key: K, value: T[K], oldValue: T[K]): Promise<boolean> {
		if (this._closed) throw new Error(`Cannot update an entry on a closed storage (${this.id})`);

		logger.trace('%s UpdateIf: %s, %s, %s', this.connection.grid.localPeerId, key, value, oldValue);
		
		return (await this.connection.requestUpdateEntries(
			Collections.mapOf([ key as string, this._encodeValue(key, value) ]),
			undefined,
			this._encodeValue(key, oldValue)
		)).get(key as string) !== undefined;
	}
    
	public async delete<K extends keyof T>(key: K): Promise<boolean> {
		return (await this.connection.requestDeleteEntries(
			Collections.setOf(key as string)
		)).has(key as string);
	}
    
	/**
	 * Exports the storage data
	 */
	public export(): HamokRecordSnapshot {
		if (this._closed) {
			throw new Error(`Cannot export data on a closed storage (${this.id})`);
		}
		const entries = new Map<string, string>();

		for (const [ key, value ] of Object.entries(this._object)) {
			const encodedValue = this._encodeValue(key as keyof T, value as T[keyof T]);

			entries.set(key, encodedValue);
		}
		const [ keys, values ] = this.connection.codec.encodeEntries(entries);
		const result: HamokRecordSnapshot = {
			recordId: this.id,
			keys,
			values
		};

		return result;
	}

	public import(data: HamokRecordSnapshot, eventing?: boolean) {
		if (data.recordId !== this.id) {
			throw new Error(`Cannot import data from a different storage: ${data.recordId} !== ${this.id}`);
		} else if (this.connection.connected) {
			throw new Error('Cannot import data while connected');
		} else if (this._closed) {
			throw new Error(`Cannot import data on a closed storage (${this.id})`);
		}

		const entries = this.connection.codec.decodeEntries(data.keys, data.values);

		for (const [ key, encodedValue ] of entries) {
			const newValue = this._decodeValue(key, encodedValue);
			const oldValue = this._object[key as keyof T];

			this._object[key as keyof T] = newValue;
			if (eventing) {
				if (oldValue !== undefined) this.emit('update', { 
					key: key as keyof T, 
					oldValue: oldValue as T[keyof T], 
					newValue: newValue as T[keyof T], 
				});
				else this.emit('insert', {
					key,
					value: newValue,
				});
			}
		}
	}

	private _encodeValue<K extends keyof T>(key: K, value: T[K]): string {
		return this._payloadsCodec?.get(key)?.encode(value) ?? JSON.stringify(value);
	}

	private _decodeValue(key: string, value: string): T[keyof T] {
		return this._payloadsCodec?.get(key as keyof T) ?? JSON.parse(value);
	}
}