import { HamokConnection } from './HamokConnection';
import { BaseMap } from './BaseMap';
import { HamokQueueSnapshot } from '../HamokSnapshot';
import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import * as Collections from '../common/Collections';

const logger = createLogger('HamokQueue');

export type HamokQueueEventMap = {
	'empty': [];
	'not-empty': [];
	'close': [];
	'remove': [unknown];
}

export type HamokQueueConfig = {
	queueId: string;
	maxQueueSize?: number;
}

function *iterator<T>(first: number, last: number, baseMap: BaseMap<number, T>): IterableIterator<T> {
	if (last < first) throw new Error('Invalid iterator parameters. first > last');
	if (first === last) return;
	for (let i = first; i < last; i++) {
		const item = baseMap.get(i);

		if (item === undefined) {
			throw new Error('Invalid iterator parameters. Item is undefined');
		}

		yield item;
	}
}

export class HamokQueue<T> extends EventEmitter<HamokQueueEventMap> {
	private _head = 0;
	private _tail = 0;
	private _closed = false;
    
	public constructor(
		public readonly connection: HamokConnection<number, T>,
		public readonly baseMap: BaseMap<number, T>,
	) {
		super();
		this.setMaxListeners(Infinity);
		
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

				this._head = this._tail;
					
				this.emit('empty');
				
			})
			.on('InsertEntriesRequest', (request) => {
				const wasEmpty = this.empty;

				for (const value of request.entries.values()) {
					this.baseMap.set(this._tail, value);
					++this._tail;
				}

				if (wasEmpty) {
					this.emit('not-empty');
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'InsertEntriesResponse',
						request.createResponse(Collections.EMPTY_MAP),
						request.sourceEndpointId
					);
				}
			})
			.on('RemoveEntriesRequest', (request) => {
				const removedEntries = new Map<number, T>();
                    
				for (const key of request.keys.values()) {
					if (key !== this._head) {
						continue;
					}
					const value = this._pop();

					if (value == undefined) {
						continue;
					}

					removedEntries.set(key, value);
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {

					this.connection.respond(
						'RemoveEntriesResponse',
						request.createResponse(
							removedEntries
						),
						request.sourceEndpointId
					);
				}

				removedEntries.forEach((v) => this.emit('remove', v));
			})
			.once('close', () => this.close())
		;

		logger.trace('Queue %s is created', this.id);
	}

	public get id(): string {
		return this.connection.config.storageId;
	}

	public get empty() {
		return this._head === this._tail;
	}

	public get size() {
		return this._tail - this._head;
	}

	public async push(...values: T[]): Promise<void> {
		if (this._closed) throw new Error('Cannot push on a closed queue');
		
		const entries: [number, T][] = [];

		values.forEach((value, index) => entries.push([ index, value ]));
		
		return this.connection.requestInsertEntries(
			Collections.mapOf<number, T>(
				...entries,
			)
		).then(() => void 0);
	}
    
	public async pop(): Promise<T | undefined> {
		if (this._closed) throw new Error('Cannot pop on a closed queue');

		while (!this.empty) {
			const head = this._head;
			const result = (await this.connection.requestRemoveEntries(Collections.setOf(head))).get(head);

			if (result !== undefined) return result;
		}
	}

	public peek(): T | undefined {
		if (this._closed) throw new Error('Cannot peek on a closed queue');
		
		return this.baseMap.get(this._head);
	}

	public async clear(): Promise<void> {
		if (this._closed) throw new Error('Cannot clear a closed queue');
		if (this.empty) return;
		
		return this.connection.requestClearEntries().then(() => void 0);
	}

	public [Symbol.iterator](): IterableIterator<T> {
		return iterator(this._head, this._tail, this.baseMap);
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		this.connection.close();

		this.baseMap.clear();

		this.emit('close');
	} 

	public export(): HamokQueueSnapshot {
		if (this._closed) throw new Error('Cannot export data on a closed queue');

		const sortedEntries = [ ...this.baseMap ].sort(([ a ], [ b ]) => a - b);
		const [ keys, values ] = this.connection.codec.encodeEntries(
			new Map(sortedEntries)
		);
        
		return {
			queueId: this.id,
			keys,
			values,
		};
	}

	public import(snapshot: HamokQueueSnapshot): void {
		if (snapshot.queueId !== this.id) {
			throw new Error(`Cannot import data from a different queue: ${snapshot.queueId} !== ${this.id}`);
		} else if (this.connection.connected) {
			throw new Error('Cannot import data while connected');
		} else if (this._closed) {
			throw new Error('Cannot import data on a closed queue');
		}

		this.baseMap.clear();
		
		const entries = this.connection.codec.decodeEntries(snapshot.keys, snapshot.values);

		this.baseMap.setAll(entries);

		this._head = 0;
		this._tail = 0;
		for (const key of entries.keys()) {
			if (this._head === 0 || key < this._head) {
				this._head = key;
			}
			if (this._tail === 0 || this._tail < key) {
				this._tail = key;
			}
		}
		if (this._head !== this._tail) {
			++this._tail;
		}
	}

	private _pop(): T | undefined {
		if (this.empty) return undefined;
		const value = this.baseMap.get(this._head);

		if (value === undefined) return undefined;

		this.baseMap.delete(this._head);
		++this._head;

		if (this.empty) {
			this.emit('empty');
		}
		
		return value;
	}
}