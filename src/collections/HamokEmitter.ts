import { EventEmitter } from 'events';
import { HamokConnection } from './HamokConnection';
import { createLogger } from '../common/logger';
import * as Collections from '../common/Collections';
import { HamokEmitterSnapshot } from '../HamokSnapshot';

const logger = createLogger('HamokEmitter');

export interface HamokEmitterEventMap extends Record<string, unknown[]> {
	// empty
}

type UpdatedMetaData<M extends Record<string, unknown>> = {
	prevMetaData?: M | null;
	newMetaData: M;
}

export type HamokEmitterStats = {
	numberOfSubscriptions: number;
	numberOfReceivedEventInvocations: number;
	numberOfSentEventInvocations: number;
}

export class HamokEmitter<T extends HamokEmitterEventMap, M extends Record<string, unknown> = Record<string, unknown>> {
	// private readonly _subscriptions = new Map<keyof T, Set<string>>();
	public readonly subscriptions = new HamokEmitterSubscriptions<T, M>();
	private readonly _emitter = new EventEmitter();
	private _initializing?: Promise<this>;
	private _closed = false;

	public stats: HamokEmitterStats = {
		numberOfSubscriptions: 0,
		numberOfReceivedEventInvocations: 0,
		numberOfSentEventInvocations: 0,
	};
    
	public constructor(
		public readonly connection: HamokConnection<string, string>,
		public readonly payloadsCodec?: Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>,
		public readonly autoClean?: boolean
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
				let responseEntries: Map<string, string> | undefined;
				
				for (const [ event, serializedMetaData ] of request.entries.entries()) {
					try {
						if (this.subscriptions.hasPeerOnEvent(event as keyof T, request.sourceEndpointId)) {
							const metaDataUpdate = JSON.parse(serializedMetaData) as UpdatedMetaData<M>;
							const updated = this.subscriptions.updatePeer(
								event as keyof T, 
								request.sourceEndpointId, 
								metaDataUpdate.newMetaData, 
								metaDataUpdate.prevMetaData
							);

							if (!updated) {
								if (!responseEntries) responseEntries = new Map();

								responseEntries.set(event, 'not-updated');

								continue;
							}
						} else {
							// this is a new subscription
							let metaData: M | null = null;

							if (serializedMetaData !== 'null') metaData = JSON.parse(serializedMetaData);

							this.subscriptions.addPeer(event, request.sourceEndpointId, metaData);
						}
					} catch (err) {
						logger.error('Error while decoding the metadata for %s, %s, %o', this.id, event, `${err}`);
						continue;
					}

					logger.debug('%s InsertEntriesRequest is received, %s is added to the subscription list for %s', 
						this.connection.grid.localPeerId,
						request.sourceEndpointId,
						event
					);
				}

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'InsertEntriesResponse',
						request.createResponse(responseEntries ?? Collections.EMPTY_MAP),
						request.sourceEndpointId
					);
				}
			})
			.on('DeleteEntriesRequest', (request) => {
				const removedPeerIds = [ ...request.keys ];

				removedPeerIds.forEach((peerId) => this.subscriptions.removePeerFromAllEvent(peerId));
				
				logger.debug('DeleteEntriesRequest is received, %o is removed from the subscription list for %s', removedPeerIds, this.id);

				if (request.sourceEndpointId === this.connection.grid.localPeerId) {
					this.connection.respond(
						'DeleteEntriesResponse',
						request.createResponse(new Set(removedPeerIds)),
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

				this.subscriptions.removePeerFromAllEvent(request.sourceEndpointId);

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
						
						++this.stats.numberOfReceivedEventInvocations;
					
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

						++this.stats.numberOfReceivedEventInvocations;

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

				this.subscriptions.removePeerFromAllEvent(request.sourceEndpointId);
			})
			.on('remote-peer-removed', async (remotePeerId) => {
				if (this.connection.grid.leaderId !== this.connection.localPeerId) return;
				if (this.connection.localPeerId === remotePeerId) return;
				if (!this.autoClean) return;
				
				for (let retried = 0; retried < 10; retried++) {
					try {
						await this.cleanup();
						break;
					} catch (err) {
						if (retried < 8) continue;
						logger.error('Error while cleaning up subscriptions in emitter %s, error: %o', this.id, err);
						break;
					}
				}
			})
			.on('leader-changed', async (leaderId) => {
				if (leaderId !== this.connection.localPeerId || !this.autoClean) {
					return;
				}

				try {
					await this.cleanup();
				} catch (err) {
					logger.error('Error while cleaning up subscriptions in emitter %s, error: %o', this.id, err);
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
					logger.error(`Failed to send snapshot: ${err}`);
				}
			})
			.on('remote-snapshot', (serializedSnapshot, done) => {
				try {
					const snapshot = JSON.parse(serializedSnapshot) as HamokEmitterSnapshot;

					this._import(snapshot);

					this.subscriptions.emit('debug', `Imported snapshot from ${JSON.stringify(snapshot)}`);
				} catch (err) {
					logger.error(`Failed to import to emitter ${this.id}. Error: ${err}`);
				} finally {
					done();
				}
			})
			.once('close', () => this.close())
		;

		this.subscriptions
			.on('added', () => (this.stats.numberOfSubscriptions = this.subscriptions.size))
			.on('removed', () => (this.stats.numberOfSubscriptions = this.subscriptions.size))
		;

		logger.trace('Emitter %s is created', this.id);

		process.nextTick(() => (this._initializing = this._startInitializing()));
	}

	public get id(): string {
		return this.connection.config.storageId;
	}

	public get empty() {
		return this.subscriptions.size < 1;
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
		this.subscriptions.removeAllListeners();
	}

	/**
	 * This method is used to cleanup the subscriptions by removing the endpoints that are not in the grid anymore.
	 */
	public async cleanup() {
		const removedPeerIds = this.subscriptions.getAllPeerIds();

		removedPeerIds.delete(this.connection.grid.localPeerId);

		for (const remotePeerId of this.connection.grid.remotePeerIds) {
			if (removedPeerIds.has(remotePeerId)) removedPeerIds.delete(remotePeerId);
		}
		if (0 < removedPeerIds.size) {
			this.subscriptions.emit('debug', `Removing endpoints ${JSON.stringify(removedPeerIds)} from subscriptions in emitter ${this.id}`);

			return this.connection.requestDeleteEntries(removedPeerIds);
		}
	}

	public async hasSubscribers<K extends keyof T>(event: K, filterByLocalNode = false): Promise<boolean> {
		if (this._closed) throw new Error('Cannot check subscribers on a closed emitter');

		await this._initializing;

		await this.connection.grid.waitUntilCommitHead();

		const remotePeerIds = this.subscriptions.getPeerIds(event);

		if (!remotePeerIds) return false;
		else if (!filterByLocalNode) return true;
		else return remotePeerIds.has(this.connection.grid.localPeerId);
	}

	public async subscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void, metaData: M | null = null): Promise<void> {
		if (this._closed) throw new Error('Cannot subscribe on a closed emitter');

		await this._initializing;

		// if we already have a listener, we don't need to subscribe in the raft
		if (this._emitter.listenerCount(event as string)) {
			return (this._emitter.on(event as string, listener), void 0);
		}
		let serializedMetaData: string;

		if (metaData) {
			try {
				serializedMetaData = JSON.stringify(metaData);
			} catch (err) {
				logger.error('Error while serializing metadata for %s, %s, %o', this.id, event, `${err}`);
				serializedMetaData = 'null';
			}
		} else serializedMetaData = 'null';
		
		this._emitter.on(event as string, listener);
		try {
			await this.connection.requestInsertEntries(new Map([ [ event as string, serializedMetaData ] ]));
		} catch (err) {
			this._emitter.off(event as string, listener);
			throw err;
		}
	}

	public async updateSubscriptionMetaData<K extends keyof T>(event: K, newMetaData: M, prevMetaData?: M | null): Promise<boolean> {
		if (this._closed) throw new Error('Cannot subscribe on a closed emitter');

		await this._initializing;

		// if we already have a listener, we don't need to subscribe in the raft
		if (!this._emitter.listenerCount(event as string)) {
			throw new Error('Cannot update a non-existing subscription');
		}

		const updatedMetaData: UpdatedMetaData<M> = { 
			prevMetaData,
			newMetaData, 
		};
		const serializedMetaData = JSON.stringify(updatedMetaData);

		return (await this.connection.requestInsertEntries(new Map([ [ event as string, serializedMetaData ] ]))).get(event as string) === undefined;
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

		const remotePeerIds = this.subscriptions.getPeerIds(event);

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

		++this.stats.numberOfSentEventInvocations;

		return result;
	}

	public notify<K extends keyof T>(event: K, ...args: T[K]): boolean {
		if (this._closed) throw new Error('Cannot publish on a closed emitter');

		const remotePeerIds = this.subscriptions.getPeerIds(event);

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

		++this.stats.numberOfSentEventInvocations;

		return true;
	}

	public export(): HamokEmitterSnapshot {
		if (this._closed) throw new Error('Cannot export a closed emitter');

		const subscriptions: HamokEmitterSnapshot['subscriptions'] = [];
        
		for (const [ event, peerMap ] of this.subscriptions.entries()) {
			const subscribers: HamokEmitterSnapshot['subscriptions'][number]['subscribers'] = [];

			for (const [ peerId, metaData ] of peerMap.entries()) {
				subscribers.push({
					peerId, 
					metaData,
				});
			}

			subscriptions.push({
				event: event as string,
				subscribers,
			});
		}
		
		return {
			emitterId: this.id,
			subscriptions,
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
		for (const subscription of snapshot.subscriptions) {
			for (const { peerId, metaData } of subscription.subscribers) {
				this.subscriptions.addPeer(subscription.event as keyof T, peerId, metaData as M | null);
			}
		}
	}

	private async _startInitializing() {
		try {
			await this.connection.join();
		} catch (err) {
			logger.error('Error while initializing emitter', err);
		} finally {
			this._initializing = undefined;
		}

		return this;
	}
}

type HamokSubscriptionsEmitterEventMap<EventMap extends HamokEmitterEventMap, M extends Record<string, unknown> = Record<string, unknown>> = {
	'added': [
		event: keyof EventMap, 
		peerId: string,
		metaData: M | null,
	],
	'updated': [
		event: keyof EventMap,
		peerId: string,
		newMetaData: M,
		prevMetaData?: M | null,
	],
	'removed': [
		event: keyof EventMap,
		peerId: string,
		metaData: M | null,
	],
	'debug': [
		log: string,
	]
}

class HamokEmitterSubscriptions<EventMap extends HamokEmitterEventMap, M extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter<HamokSubscriptionsEmitterEventMap<EventMap, M>> {
	private readonly _map = new Map<keyof EventMap, Map<string, null | M>>();

	public hasEvent<K extends keyof EventMap>(event: K): boolean {
		return this._map.has(event);
	}

	public addPeer<K extends keyof EventMap>(event: K, peerId: string, metaData: M | null = null): boolean {
		let peersMap = this._map.get(event);

		if (!peersMap) {
			peersMap = new Map<string, null | M>();
			this._map.set(event, peersMap);
		} else if (peersMap.has(peerId)) return false;

		peersMap.set(peerId, metaData);

		this.emit('added', event, peerId, metaData);

		return true;
	}

	public updatePeer<K extends keyof EventMap>(event: K, peerId: string, metaData: M, prevMetaData?: M | null): boolean {
		const peersMap = this._map.get(event);
		const currentMetaData = peersMap?.get(peerId);

		if (!peersMap || currentMetaData === undefined) return false;

		if (prevMetaData !== undefined) {
			const serializedCurrentMetaData = JSON.stringify(currentMetaData);
			const serializedPrevMetaData = JSON.stringify(prevMetaData);

			if (serializedCurrentMetaData !== serializedPrevMetaData) return false;
		}

		peersMap.set(peerId, metaData);

		this.emit('updated', event, peerId, metaData, currentMetaData);

		return true;
	}

	public removePeer<K extends keyof EventMap>(event: K, peerId: string): boolean {
		const peersMap = this._map.get(event);
		const metaData = peersMap?.get(peerId);
		
		if (!peersMap || !peersMap.delete(peerId)) return false;
		if (peersMap.size < 1) {
			this._map.delete(event);
		}

		this.emit('removed', event, peerId, metaData ?? null);

		return true;
	}

	public removePeerFromAllEvent(peerId: string): boolean {
		const events = [ ...this.events() ];
		let removedAtLeastFromOneEvent = false;

		for (const event of events) {
			removedAtLeastFromOneEvent = this.removePeer(event, peerId) || removedAtLeastFromOneEvent;
		}

		return removedAtLeastFromOneEvent;
	}

	public getEventPeersMap<K extends keyof EventMap>(event: K): Map<string, M | null> | undefined {
		return this._map.get(event);
	}

	public entries(): IterableIterator<[keyof EventMap, Map<string, M | null>]> {
		return this._map.entries();
	}

	public events(): IterableIterator<keyof EventMap> {
		return this._map.keys();
	}

	public hasPeerOnEvent<K extends keyof EventMap>(event: K, peerId: string): boolean {
		const peersMap = this._map.get(event);

		return peersMap ? peersMap.has(peerId) : false;
	}

	public getPeerIds<K extends keyof EventMap>(event: K): Set<string> | undefined {
		const peersMap = this._map.get(event);

		if (!peersMap) return;
		else return new Set([ ...peersMap.keys() ]);
	}

	public getAllPeerIds(): Set<string> {
		const peerIds = new Set<string>();

		for (const peersMap of this._map.values()) {
			for (const peerId of peersMap.keys()) {
				peerIds.add(peerId);
			}
		}

		return peerIds;
	}

	public get [Symbol.toStringTag]() {
		return 'HamokSubscriptions';
	}

	public get size() {
		return this._map.size;
	}

	public get [Symbol.species]() {
		return HamokEmitterSubscriptions;
	}
}