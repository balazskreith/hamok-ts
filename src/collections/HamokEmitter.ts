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
				for (const subscribedPeerIds of this._subscriptions.values()) {
					subscribedPeerIds.delete(remotePeerId);
				}
				logger.debug('%s remote-peer-removed is received, %s is removed from the subscription list for all events in emitter %s', this.connection.localPeerId, remotePeerId, this.id);
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

	public close() {
		if (this._closed) return;
		this._closed = true;

		this.connection.close();
		this._emitter.removeAllListeners();
	}

	public async subscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void): Promise<void> {
		if (this._closed) throw new Error('Cannot subscribe on a closed emitter');
		
		await this.connection.requestInsertEntries(new Map([ [ event as string, 'empty' ] ]));
		this._emitter.on(event as string, listener);
	}

	public async unsubscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void): Promise<void> {
		if (this._closed) throw new Error('Cannot unsubscribe on a closed emitter');

		await this.connection.requestRemoveEntries(
			Collections.setOf(event as string)
		);
		this._emitter.off(event as string, listener);
	}

	public clear() {
		this.connection.notifyClearEntries();
		this._emitter.removeAllListeners();
	}

	public async publish<K extends keyof T>(event: K, ...args: T[K]): Promise<string[]> {
		if (this._closed) throw new Error('Cannot publish on a closed emitter');

		const remotePeerIds = this._subscriptions.get(event);
		const entry = [ event as string, this.payloadsCodec?.get(event)?.encode(...args) ?? JSON.stringify(args) ] as [string, string];

		if (!remotePeerIds || remotePeerIds.size < 1) return [];

		const respondedPeerIds = await this.connection.requestUpdateEntries(
			new Map([ entry ]),
			[ ...remotePeerIds ].filter((peerId) => peerId !== this.connection.grid.localPeerId)
		);
		const result = [ ...respondedPeerIds.keys() ];

		if (remotePeerIds?.has(this.connection.grid.localPeerId)) {
			this._emitter.emit(event as string, ...args);
			result.push(this.connection.grid.localPeerId);
		}

		return result;
	}

	public notify<K extends keyof T>(event: K, ...args: T[K]): boolean {
		if (this._closed) throw new Error('Cannot publish on a closed emitter');

		const remotePeerIds = this._subscriptions.get(event);
		const entry = [ event as string, this.payloadsCodec?.get(event)?.encode(...args) ?? JSON.stringify(args) ] as [string, string];
		let delivered = false;

		for (const remotePeerId of remotePeerIds ?? []) {
			if (remotePeerId === this.connection.grid.localPeerId) continue;
			
			this.connection.notifyUpdateEntries(
				new Map([ entry ]),
				remotePeerId
			);
			delivered = true;
		}

		if (remotePeerIds?.has(this.connection.grid.localPeerId)) {
			delivered ||= this._emitter.emit(event as string, ...args);
		}

		return delivered;
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

		for (let i = 0; i < snapshot.events.length; i++) {
			const event = snapshot.events[i];
			const peerIds = snapshot.subscribers[i] ?? [];

			this._subscriptions.set(event, new Set(peerIds));
		}
	}
}