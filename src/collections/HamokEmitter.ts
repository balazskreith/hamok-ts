import { EventEmitter } from 'events';
import { HamokConnection } from './HamokConnection';
import { createLogger } from '../common/logger';
import * as Collections from '../common/Collections';
import { HamokEmitterSnapshot } from '../HamokSnapshot';

const logger = createLogger('HamokEmitter');

export interface HamokEmitterEventMap extends Record<string, unknown[]> {
	// empty
}

export class HamokEmitter<T extends HamokEmitterEventMap> {
	private readonly _subscriptions = new Map<keyof T, Set<string>>();
	private readonly _emitter = new EventEmitter();
	private _initializing?: Promise<this>;
	private _removedPeerIdsBuffer: string[] = [];
	private _closed = false;
    
	public constructor(
		public readonly connection: HamokConnection<string, string>,
		public readonly payloadsCodec?: Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>
	) {
		this.connection
			.on('InsertEntriesRequest', (request) => {
				// this is for the subscription to manage and to add the source endpoint to the list
				if (request.sourceEndpointId === undefined) {
					return logger.warn('%s InsertEntriesRequest is received without sourceEndpointId, for %s, it is impossible to add the source endpoint to the list. %o', 
						this.connection.grid.localPeerId, 
						this.id, 
						request
					);
				}
				for (const event of request.entries.keys()) {
					let subscribedPeerIds = this._subscriptions.get(event);
                    
					if (!subscribedPeerIds) {
						subscribedPeerIds = new Set<string>();
						this._subscriptions.set(event, subscribedPeerIds);
					}
					subscribedPeerIds.add(request.sourceEndpointId);

					logger.debug('%s InsertEntriesRequest is received, %s is added to the subscription list for %s', 
						this.connection.grid.localPeerId,
						request.sourceEndpointId,
						event
					);
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'InsertEntriesResponse',
						request.createResponse(Collections.EMPTY_MAP),
						request.sourceEndpointId
					);
				}
			})
			.on('DeleteEntriesRequest', (request) => {
				const removedPeerIds = [ ...request.keys ];

				for (const subscribedPeerIds of [ ...this._subscriptions.values() ]) {
					for (const removedPeerId of removedPeerIds) {
						subscribedPeerIds.delete(removedPeerId);

						if (subscribedPeerIds.size < 1) {
							this._subscriptions.delete(removedPeerId);
						}
					}
				}
				logger.info('DeleteEntriesRequest is received, %o is removed from the subscription list for %s', removedPeerIds, this.id);
			})
			.on('RemoveEntriesRequest', (request) => {
				// this is for the subscription to manage, and to remove the source endpoint from the list
				if (request.sourceEndpointId === undefined) {
					return logger.warn('%s RemoveEntriesRequest is received without sourceEndpointId, for %s, it is impossible to remove the source endpoint from the list. %o', 
						this.connection.grid.localPeerId, 
						this.id, 
						request
					);
				}
				for (const event of request.keys) {
					const subscribedPeerIds = this._subscriptions.get(event);
                    
					if (!subscribedPeerIds) continue;

					subscribedPeerIds.delete(request.sourceEndpointId);

					if (subscribedPeerIds.size < 1) {
						this._subscriptions.delete(event);
					}

					logger.debug('%s RemoveEntriesRequest is received, %s is removed from the subscription list for %s',
						this.connection.grid.localPeerId,
						request.sourceEndpointId,
						event
					);
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'RemoveEntriesResponse',
						request.createResponse(Collections.EMPTY_MAP),
						request.sourceEndpointId
					);
				}
				
			})
			.on('UpdateEntriesRequest', (request) => {
				// this is for the events to emit

				for (const [ event, serializedPayload ] of request.entries) {
					try {
						const payloads = this.payloadsCodec?.get(event)?.decode(serializedPayload) ?? JSON.parse(serializedPayload);

						this._emitter.emit(event, ...payloads);
					} catch (err) {
						logger.error('Error while decoding the payload for %s, %s, %o', this.id, event, `${err}`);
					}
				} 

				this.connection.respond(
					'UpdateEntriesResponse', 
					request.createResponse(new Map([ [ this.connection.localPeerId, 'empty' ] ])), 
					request.sourceEndpointId
				);
			})
			.on('UpdateEntriesNotification', (notification) => {
				// this is for the events to emit

				for (const [ event, serializedPayload ] of notification.updatedEntries) {
					try {
						const payloads = this.payloadsCodec?.get(event)?.decode(serializedPayload) ?? JSON.parse(serializedPayload);

						this._emitter.emit(event, ...payloads);
					} catch (err) {
						logger.error('Error while decoding the payload for %s, %s, %o', this.id, event, `${err}`);
					}
				}  
			})
			.on('ClearEntriesNotification', (request) => {
				// this is for the subscription to manage, and to remove the source endpoint from the list
				if (request.sourceEndpointId === undefined) {
					return logger.warn('%s ClearEntriesNotification is received without sourceEndpointId, for %s, it is impossible to remove the source endpoint from the list. %o', 
						this.connection.grid.localPeerId, 
						this.id, 
						request
					);
				}

				for (const event of this._subscriptions.keys()) {
					const subscribedPeerIds = this._subscriptions.get(event);
                    
					if (!subscribedPeerIds) continue;

					subscribedPeerIds.delete(request.sourceEndpointId);

					if (subscribedPeerIds.size < 1) {
						this._subscriptions.delete(event);
					}

					logger.debug('%s ClearEntriesNotification is received, %s is removed from the subscription list for %s',
						this.connection.grid.localPeerId,
						request.sourceEndpointId,
						event
					);
				}
			})
			.on('remote-peer-removed', (remotePeerId) => {
				if (this.connection.grid.leaderId !== this.connection.localPeerId) {
					if (this.connection.grid.leaderId === undefined) {
						this._removedPeerIdsBuffer.push(remotePeerId);
					}
					
					return;
				}
				let retried = 0;
				const process = async (): Promise<unknown> => {
					if (this.connection.grid.leaderId === undefined) {
						return Promise.resolve(this._removedPeerIdsBuffer.push(remotePeerId));
					} else if (this.connection.grid.leaderId !== this.connection.localPeerId) {
						// not our problem.
						return Promise.resolve();
					}
					try {
						return this.connection.requestDeleteEntries(new Set([ remotePeerId ]));
					} catch (err) {
						logger.warn('Error while requesting to remove endpoint %s, from subscriptions in emitter %s, error: %o', remotePeerId, this.id, err);

						if (++retried < 10) {
							return process();
						}
					}
				};
				
				process().catch(() => void 0);
			})
			.on('leader-changed', (leaderId) => {
				if (leaderId !== this.connection.grid.localPeerId) {
					if (leaderId !== undefined) {
						this._removedPeerIdsBuffer = [];
					}
					
					return;
				}
				if (0 < this._removedPeerIdsBuffer.length) {
					this.connection.requestDeleteEntries(new Set(this._removedPeerIdsBuffer))
						.then(() => (this._removedPeerIdsBuffer = []))
						.catch(() => {
							logger.warn('Error while requesting to remove endpoints %o, from subscriptions in emitter %s', this._removedPeerIdsBuffer, this.id);
						});
				}
			})
			.on('StorageHelloNotification', (notification) => {
				// every storage needs to respond with its snapshot and the highest applied index they have
				try {
					const snapshot = this.export();
					const serializedSnapshot = JSON.stringify(snapshot);
	
					this.connection.notifyStorageState(
						serializedSnapshot,
						this.connection.highestSeenCommitIndex,
						notification.sourceEndpointId, 
					);
				} catch (err) {
					logger.error('Failed to send snapshot', err);
				}
			})
			.on('remote-snapshot', (serializedSnapshot, done) => {
				try {
					const snapshot = JSON.parse(serializedSnapshot) as HamokEmitterSnapshot;

					this._import(snapshot);
				} catch (err) {
					logger.error(`Failed to import to emitter ${this.id}. Error: ${err}`);
				} finally {
					done();
				}
			})
			.once('close', () => this.close())
		;

		logger.trace('Emitter %s is created', this.id);

		this._initializing = new Promise((resolve) => setTimeout(resolve, 20))
			.then(() => this.connection.join())
			.then(() => this)
			.catch((err) => {
				logger.error('Error while initializing emitter', err);

				return this;
			})
			.finally(() => (this._initializing = undefined))
		;
		
	}

	public get id(): string {
		return this.connection.config.storageId;
	}

	public get empty() {
		return this._subscriptions.size < 1;
	}

	public get ready(): Promise<this> {
		return this._initializing ?? this.connection.grid.waitUntilCommitHead().then(() => this);
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		this.connection.close();
		this._emitter.removeAllListeners();
	}

	public async hasSubscribers<K extends keyof T>(event: K, filterByLocalNode = false): Promise<boolean> {
		if (this._closed) throw new Error('Cannot check subscribers on a closed emitter');

		await this._initializing;

		await this.connection.grid.waitUntilCommitHead();

		const remotePeerIds = this._subscriptions.get(event);

		if (!remotePeerIds) return false;
		else if (!filterByLocalNode) return true;
		else return remotePeerIds.has(this.connection.grid.localPeerId);
	}

	public async subscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void): Promise<void> {
		if (this._closed) throw new Error('Cannot subscribe on a closed emitter');

		await this._initializing;

		// if we already have a listener, we don't need to subscribe in the raft
		if (this._emitter.listenerCount(event as string)) {
			return (this._emitter.on(event as string, listener), void 0);
		}
		
		await this.connection.requestInsertEntries(new Map([ [ event as string, 'empty' ] ]));
		this._emitter.on(event as string, listener);
	}

	public async unsubscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void): Promise<void> {
		if (this._closed) throw new Error('Cannot unsubscribe on a closed emitter');
		
		await this._initializing;

		this._emitter.off(event as string, listener);

		// if we still have a listener, we don't need to unsubscribe in the raft
		if (this._emitter.listenerCount(event as string)) return;
		
		await this.connection.requestRemoveEntries(
			Collections.setOf(event as string)
		);
	}

	public clear() {
		this.connection.notifyClearEntries();
		this._emitter.removeAllListeners();
	}

	public async publish<K extends keyof T>(event: K, ...args: T[K]): Promise<string[]> {
		if (this._closed) throw new Error('Cannot publish on a closed emitter');

		await this._initializing;

		const remotePeerIds = this._subscriptions.get(event);

		if (!remotePeerIds || remotePeerIds.size < 1) {
			return [];
		} else if (remotePeerIds.size === 1 && remotePeerIds.has(this.connection.grid.localPeerId)) {
			return (this._emitter.emit(event as string, ...args), [ this.connection.grid.localPeerId ]);
		}

		const entry = [ event as string, this.payloadsCodec?.get(event)?.encode(...args) ?? JSON.stringify(args) ] as [string, string];
		const [
			respondedRemotePeerIds,
			isLocalPeerSubscribed
		] = await Promise.all([
			this.connection.requestUpdateEntries(
				new Map([ entry ]),
				[ ...remotePeerIds ].filter((peerId) => peerId !== this.connection.grid.localPeerId)
			),
			Promise.resolve(remotePeerIds.has(this.connection.grid.localPeerId) ? this._emitter.emit(event as string, ...args) : false)
		]);
		const result = [ ...respondedRemotePeerIds.keys() ];

		if (isLocalPeerSubscribed) {
			result.push(this.connection.grid.localPeerId);
		}

		return result;
	}

	public notify<K extends keyof T>(event: K, ...args: T[K]): boolean {
		if (this._closed) throw new Error('Cannot publish on a closed emitter');

		const remotePeerIds = this._subscriptions.get(event);

		if (!remotePeerIds || remotePeerIds.size < 1) {
			return false;
		} else if (remotePeerIds.size === 1 && remotePeerIds.has(this.connection.grid.localPeerId)) {
			return this._emitter.emit(event as string, ...args);
		}

		const entry = [ event as string, this.payloadsCodec?.get(event)?.encode(...args) ?? JSON.stringify(args) ] as [string, string];

		for (const remotePeerId of remotePeerIds ?? []) {
			if (remotePeerId === this.connection.grid.localPeerId) {
				this._emitter.emit(event as string, ...args);

				continue;
			}
			
			this.connection.notifyUpdateEntries(
				new Map([ entry ]),
				remotePeerId
			);
		}

		return true;
	}

	public export(): HamokEmitterSnapshot {
		if (this._closed) throw new Error('Cannot export a closed emitter');

		const events: string[] = [];
		const subscribers: string[][] = [];
        
		for (const [ event, peerIds ] of this._subscriptions) {
			events.push(event as string);
			subscribers.push(Array.from(peerIds));
		}
		
		return {
			emitterId: this.id,
			events,
			subscribers
		};
	}

	public import(snapshot: HamokEmitterSnapshot): void {
		if (snapshot.emitterId !== this.id) {
			throw new Error(`Cannot import data from a different queue: ${snapshot.emitterId} !== ${this.id}`);
		} else if (this.connection.connected) {
			throw new Error('Cannot import data while connected');
		}

		this._import(snapshot);
	}

	private _import(snapshot: HamokEmitterSnapshot): void {
		for (let i = 0; i < snapshot.events.length; i++) {
			const event = snapshot.events[i];
			const peerIds = snapshot.subscribers[i] ?? [];

			this._subscriptions.set(event, new Set(peerIds));
		}
	}
}