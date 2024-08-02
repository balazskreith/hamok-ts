import { StorageConnection } from './StorageConnection';
import { BaseMap } from './BaseMap';
import { HamokQueueSnapshot } from '../HamokSnapshot';
import { EventEmitter } from 'events';
import { ConcurrentExecutor } from '../common/ConcurrentExecutor';
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
	private readonly _executor = new ConcurrentExecutor(1);
	private _head = 0;
	private _tail = 0;
	private _standalone: boolean;
	private _closed = false;
    
	public constructor(
		public readonly connection: StorageConnection<number, T>,
		public readonly baseMap: BaseMap<number, T>,
	) {
		super();

		this._standalone = this.connection.grid.leaderId === undefined;

		this.connection
			.on('ClearEntriesRequest', (request) => {
				this._processRequest(async () => {
					this.baseMap.clear();
					
					if (request.sourceEndpointId === this.connection.grid.localPeerId) {
						this.connection.respond(
							'ClearEntriesResponse', 
							request.createResponse(), 
							request.sourceEndpointId
						);
					}

					this._head = this._tail;
					
					return Promise.resolve(this.emit('empty'));
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while clearing entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('InsertEntriesRequest', (request) => {
				this._processRequest(async () => {
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
					
					return Promise.resolve(
						
					);
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while inserting entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('RemoveEntriesRequest', (request) => {
				this._processRequest(async () => {
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

					return Promise.resolve(
						removedEntries.forEach((v) => this.emit('remove', v))
					);
				}, {
					requestId: request.requestId,
					remotePeerId: request.sourceEndpointId,
				}).catch((err) => logger.error('Error while removing entries: in storage %s. Error: %s', this.id, `${err}`));
			})
			.on('leader-changed', (leaderId) => {
				this._standalone = leaderId === undefined;
				
				logger.debug('%s Stanalone flag for %s is %s', this.connection.grid.localPeerId, this.id, this._standalone ? 'true' : 'false');
			})
			.once('close', () => this.close())
		;

		this._standalone = this.connection.grid.leaderId === undefined;
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
		if (this._standalone) {
			await this._waitUntilConnected(60000);
		}

		const entries: [number, T][] = [];

		values.forEach((value, index) => entries.push([ index, value ]));
		
		return this.connection.requestInsertEntries(
			Collections.mapOf<number, T>(
				...entries,
			)
		).then(() => void 0);
	}
    
	public async pop(): Promise<T | undefined> {
		if (this._standalone) {
			await this._waitUntilConnected(60000);
		}

		while (!this.empty) {
			const head = this._head;
			const result = (await this.connection.requestRemoveEntries(Collections.setOf(head))).get(head);

			if (result !== undefined) return result;
		}
	}

	public peek(): T | undefined {
		return this.baseMap.get(this._head);
	}

	public async clear(): Promise<void> {
		if (this._standalone) {
			await this._waitUntilConnected(60000);
		}

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
		if (!this._standalone) {
			throw new Error(`Cannot import data to a non-standalone queue: ${this.id}`);
		} else if (snapshot.queueId !== this.id) {
			throw new Error(`Cannot import data from a different queue: ${snapshot.queueId} !== ${this.id}`);
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

	private _processRequest<R>(fn: () => Promise<R>, options?: {
		requestId?: string,
		remotePeerId?: string,
		removeOngoingAfterDone?: boolean,
	}): Promise<R> {

		if (options?.remotePeerId && options?.requestId) {
			this.connection.grid.ongoingRequestsNotifier.add({
				requestId: options.requestId,
				remotePeerId: options.remotePeerId,
				storageId: this.id,
			});
		}
		
		return this._executor.execute<R>(async () => {
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

	private _waitUntilConnected(timeoutInMs: number, intervalInMs = 200): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const started = Date.now();

			const timer = setInterval(() => {
				const now = Date.now();

				logger.trace('%s Checking if the queue is connected to the grid %d', this.connection.grid.localPeerId, this._standalone);
				
				if (timeoutInMs < now - started) reject(`Cannot pop from ${this.id}, becasue it is not connected to the grid`);
				if (this._standalone) return;
				clearInterval(timer);
				resolve();
			}, intervalInMs);
		});
	}
}