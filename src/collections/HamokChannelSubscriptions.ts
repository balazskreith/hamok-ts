import { EventEmitter } from 'events';
import { HamokChannelEventMap } from './HamokChannel';

export type HamokChannelSubscriptionsEmitterEventMap<EventMap extends HamokChannelEventMap, M extends Record<string, unknown> = Record<string, unknown>> = {
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

export class HamokChannelSubscriptions<EventMap extends HamokChannelEventMap, M extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter<HamokChannelSubscriptionsEmitterEventMap<EventMap, M>> {
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
		return HamokChannelSubscriptions;
	}
}
