import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { RaftEngine, RaftEngineConfig } from './raft/RaftEngine';
import { HamokMessage, HamokMessage_MessageType as HamokMessageType, HamokMessage_MessageProtocol as HamokMessageProtocol } from './messages/HamokMessage';
import { MemoryStoredRaftLogs } from './raft/MemoryStoredRaftLogs';
import { createRaftFollowerState } from './raft/RaftFollowerState';
import { LogEntry } from './raft/LogEntry';
import { RaftStateName } from './raft/RaftState';
import { HamokMap } from './collections/HamokMap';
import { HamokConnection, HamokConnectionConfig } from './collections/HamokConnection';
import { OngoingRequestsNotifier } from './messages/OngoingRequestsNotifier';
import { createHamokJsonBinaryCodec, createStrToUint8ArrayCodec, HamokCodec } from './common/HamokCodec';
import { StorageCodec } from './messages/StorageCodec';
import { BaseMap, MemoryBaseMap } from './collections/BaseMap';
import { createLogger } from './common/logger';
import { HamokGridCodec } from './messages/HamokGridCodec';
import { SubmitMessageRequest } from './messages/messagetypes/SubmitMessage';
import { HamokGrid } from './HamokGrid';
import { createRaftEmptyState } from './raft/RaftEmptyState';
import { HamokQueue } from './collections/HamokQueue';
import { HamokEmitter, HamokEmitterEventMap } from './collections/HamokEmitter';
import { RaftLogs } from './raft/RaftLogs';
import { HamokRecord, HamokRecordObject } from './collections/HamokRecord';
import { EndpointStatesNotification } from './messages/messagetypes/EndpointNotification';
import { JoinNotification } from './messages/messagetypes/JoinNotification';
import { RemoteMap } from './collections/RemoteMap';
import { HamokRemoteMap } from './collections/HamokRemoteMap';

const logger = createLogger('Hamok');

export type HamokJoinProcessParams = {

	/**
	 * Timeout in milliseconds for fetching the remote peers.
	 * 
	 * DEFAULT: 5000
	 */
	fetchRemotePeerTimeoutInMs?: number,

	/**
	 * The maximum number of retries for fetching the remote peers.
	 * -1 - means infinite retries
	 * 0 - means no retries
	 * 
	 * DEFAULT: 3
	 */
	maxRetry?: number;
}

export type HamokObjectConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {

	/**
	 * Indicate if the Hamok should stop automatically when there are no remote peers.
	 */
	// autoStopOnNoRemotePeers?: boolean,

	/**
	 * The timeout in milliseconds for waiting for the remote storage state.
	 * 
	 * DEFAULT: 1000
	 */
	remoteStorageStateWaitingTimeoutInMs: number,

	/**
	 * A custom appData object to be used by the application utilizes Hamok.
	 */
	appData?: AppData,
}

/**
 * Configuration settings for the Hamok constructor, extending RaftEngineConfig and HamokConfig.
 */
export type HamokConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = RaftEngineConfig & Partial<HamokObjectConfig<AppData>> & {

	/**
	 * Optional. The expiration time in milliseconds for log entries.
	 * Log entries older than this duration may be purged.
	 * Only applicable when a custom RaftLogs is NOT provided.
	 * 
	 * DEFAULT: 300000 (5 minutes)
	 */
	logEntriesExpirationTimeInMs?: number,

	/**
	 * Optional. A map of initial log entries to be used by the system.
	 * The key is the log index, and the value is the LogEntry.
	 */
	initialLogEntries?: Map<number, LogEntry>,

	/**
	 * The period in milliseconds to send notifications to the source(s) about ongoing requests
	 * to prevent timeouts. This is applicable when a requestId is explicitly added to the ongoing 
	 * requests set by calling addOngoingRequestId(). Notifications stop when removeOngoingRequestId 
	 * is called. It is crucial to call this explicitly in any case as comlink does not handle 
	 * automatically stopping notifications for explicitly postponed requests.
	 */
	ongoingRequestsSendingPeriodInMs: number;

	/**
	 * Optional. A custom implementation of RaftLogs to store log entries.
	 */
	raftLogs?: RaftLogs,
}

export type HamokConnectionBuilderBaseConfig = Pick<HamokConnectionConfig, 
| 'requestTimeoutInMs' 
| 'remoteStorageStateWaitingTimeoutInMs'
> & {
	maxOutboundMessageKeys: number,
	maxOutboundMessageValues: number,
}

/**
 * Configuration settings for building a Hamok record.
 */
export type HamokRecordBuilderConfig<T extends HamokRecordObject> = Partial<HamokConnectionBuilderBaseConfig> & {

	/**
	 * The unique identifier for the record.
	 */
	recordId: string,

	/**
	 * Optional. A map of payload codecs for encoding and decoding record properties.
	 * The key is a property of the record, and the value is a codec for that property.
	 */
	payloadCodecs?: Map<keyof T, HamokCodec<T[keyof T], string>>,

	/**
	 * Optional. An initial object to be used as the base state of the record.
	 */
	initialObject?: Partial<T>,

	/**
	 * Optional. A function to determine equality between two values.
	 * Used for custom equality checking.
	 */
	equalValues?: (a: T[keyof T], b: T[keyof T]) => boolean,
}

/**
 * Configuration settings for building a Hamok map.
 */
export type HamokMapBuilderConfig<K, V> = Partial<HamokConnectionBuilderBaseConfig> & {

	/**
	 * The unique identifier for the map.
	 */
	mapId: string,

	/**
	 * Optional. A codec for encoding and decoding keys in the map.
	 */
	keyCodec?: HamokCodec<K, Uint8Array>,

	/**
	 * Optional. A codec for encoding and decoding values in the map.
	 */
	valueCodec?: HamokCodec<V, Uint8Array>,

	/**
	 * Optional. A base map to be used as the initial state of the map.
	 */
	baseMap?: BaseMap<K, V>,

	/**
	 * Optional. A function to determine equality between two values.
	 * Used for custom equality checking.
	 */
	equalValues?: (a: V, b: V) => boolean,
}

/**
 * Configuration settings for building a Hamok remote map.
 */
export type HamokRemoteMapBuilderConfig<K, V> = Omit<HamokMapBuilderConfig<K, V>, 'baseMap'> & {

	/**
	 * The remote map to be used to store the data.
	 */
	remoteMap: RemoteMap<K, V>,	

	/**
	 * Flag indicate if the events should be emitted by the event emitter or not.
	 * It also reduces the communication overhead if not needed, as for emitting events
	 * the leader should send a message to all followers to emit an event.
	 * In such case when it's not necessary (like cache maintenance) it can be disabled.
	 */
	noEvents?: boolean,
}

/**
 * Configuration settings for building a Hamok queue.
 */
export type HamokQueueBuilderConfig<T> = Partial<HamokConnectionBuilderBaseConfig> & {

	/**
	 * The unique identifier for the queue.
	 */
	queueId: string,

	/**
	 * Optional. A codec for encoding and decoding items in the queue.
	 */
	codec?: HamokCodec<T, Uint8Array>,

	/**
	 * Optional. A base map to be used as the initial state of the queue.
	 */
	baseMap?: BaseMap<number, T>,
}

/**
 * Configuration settings for building a Hamok emitter.
 */
export type HamokEmitterBuilderConfig<T extends HamokEmitterEventMap> = Partial<HamokConnectionBuilderBaseConfig> & {

	/**
	 * The unique identifier for the emitter.
	 */
	emitterId: string,

	/**
	 * Optional. A map of payload codecs for encoding and decoding event payloads.
	 * The key is an event type, and the value is a codec for that event type.
	 */
	payloadsCodec?: Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>,

}

export type HamokFetchRemotePeersResponse = {
	remotePeers: string[],
	minNumberOfLogs?: number,
	smallestCommitIndex?: number,
};

export type HamokEventMap = {
	// started: [],
	// stopped: [],
	follower: [],
	candidate: [],
	leader: [],
	message: [message: HamokMessage]
	'remote-peer-joined': [peerId: string],
	'remote-peer-left': [peerId: string],
	'leader-changed': [leaderId: string | undefined, prevLeader: string | undefined],
	'state-changed': [state: RaftStateName],
	commit: [commitIndex: number, message: HamokMessage],
	heartbeat: [],
	error: [error: Error],
	'no-heartbeat-from': [remotePeerId: string],

	// new events:
	joined:[],
	rejoining: [],
	left: [],
	close: [],
}

export type HamokStorageType = 'record' | 'map' | 'remoteMap' | 'emitter' | 'queue';
export type HamokSharedStorageMap = HamokMap<string, { type: HamokStorageType, count: number }>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface Hamok {
	on<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	once<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	emit<U extends keyof HamokEventMap>(event: U, ...args: HamokEventMap[U]): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Hamok<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly config: HamokObjectConfig<AppData>;
	public readonly raft: RaftEngine;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly storages = new Map<string, HamokRecord<any> | HamokMap<any, any> | HamokQueue<any> | HamokRemoteMap<any, any> | HamokEmitter<any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// public readonly records = new Map<string, HamokRecord<any>>();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// public readonly maps = new Map<string, HamokMap<any, any>>();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// public readonly queues = new Map<string, HamokQueue<any>>();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// public readonly emitters = new Map<string, HamokEmitter<any>>();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// public readonly remoteMaps = new Map<string, HamokRemoteMap<any, any>>();

	private _closed = false;
	private _run = false;
	// private _joining?: Promise<void>;
	private _raftTimer?: ReturnType<typeof setInterval>;
	private readonly _remoteStateRequests = new Map<string, { timer: ReturnType<typeof setTimeout>, responses: EndpointStatesNotification[] }>();
	private readonly _remoteHeartbeats = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly _codec = new HamokGridCodec();
	public readonly grid: HamokGrid;

	private _lookingForRemotePeers?: {
		timer: ReturnType<typeof setTimeout>,
		close: () => void,
	};
	private _joining?: Promise<void>;

	public constructor(providedConfig?: Partial<HamokConfig<AppData>>) {
		super();
		this.setMaxListeners(Infinity);
		this._emitMessage = this._emitMessage.bind(this);
		this._acceptLeaderChanged = this._acceptLeaderChanged.bind(this);
		this._acceptCommit = this._acceptCommit.bind(this);
		this._emitRemotePeerRemoved = this._emitRemotePeerRemoved.bind(this);
		this.removeRemotePeerId = this.removeRemotePeerId.bind(this);
		this.addRemotePeerId = this.addRemotePeerId.bind(this);
		this._sendEndpointNotificationsToAll = this._sendEndpointNotificationsToAll.bind(this);

		const raftLogs = providedConfig?.raftLogs ?? new MemoryStoredRaftLogs({
			expirationTimeInMs: providedConfig?.logEntriesExpirationTimeInMs ?? 300000,
			memorySizeHighWaterMark: 0,
		});

		this.raft = new RaftEngine(
			{
				peerId: providedConfig?.peerId ?? uuid(),
				electionTimeoutInMs: providedConfig?.electionTimeoutInMs ?? 3000,
				followerMaxIdleInMs: providedConfig?.followerMaxIdleInMs ?? 1000,
				heartbeatInMs: providedConfig?.heartbeatInMs ?? 100,
				onlyFollower: providedConfig?.onlyFollower ?? false,
			}, 
			raftLogs, 
			this
		);

		this.config = {
			appData: providedConfig?.appData ?? ({} as AppData),
			remoteStorageStateWaitingTimeoutInMs: providedConfig?.remoteStorageStateWaitingTimeoutInMs ?? 1000,
			// autoStopOnNoRemotePeers: providedConfig?.autoStopOnNoRemotePeers ?? true,
		};

		this.grid = new HamokGrid(
			this._emitMessage.bind(this),
			this.submit.bind(this),
			this.waitUntilCommitHead.bind(this),
			new OngoingRequestsNotifier(
				providedConfig?.ongoingRequestsSendingPeriodInMs ?? 1000,
				(msg) => this._emitMessage(
					this._codec.encodeOngoingRequestsNotification(msg), 
					msg.destinationEndpointId, 
					HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL)
			),
			this.raft.remotePeers,
			this.raft.logs,
			() => this.raft.localPeerId,
			() => this.raft.leaderId
		);

		this.once('close', () => {
			this.off('no-heartbeat-from', this.removeRemotePeerId);
			this.off('commit', this._acceptCommit);
			this.off('leader-changed', this._acceptLeaderChanged);
			this.off('remote-peer-left', this._emitRemotePeerRemoved);
			
			// we may add these events along the way
			this.off('remote-peer-joined', this._sendEndpointNotificationsToAll);
			this.off('remote-peer-left', this._sendEndpointNotificationsToAll);
		});
		this.on('no-heartbeat-from', this.removeRemotePeerId);
		this.on('commit', this._acceptCommit);
		this.on('leader-changed', this._acceptLeaderChanged);
		this.on('remote-peer-left', this._emitRemotePeerRemoved);
	}

	public get appData(): AppData {
		return this.config.appData ?? {} as AppData;
	}

	public get localPeerId(): string {
		return this.raft.localPeerId;
	}

	public get remotePeerIds(): ReadonlySet<string> {
		return this.raft.remotePeers;
	}

	public get leader(): boolean {
		return this.raft.leaderId === this.raft.localPeerId && this.raft.state.stateName === 'leader';
	}

	public get ready(): Promise<this> {
		return (this._joining ?? this.waitUntilLeader()).then(() => this);
	}

	public get state(): RaftStateName {
		return this.raft.state.stateName;
	}

	public get run() {
		return this._run;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;
		this._run = false;

		this._stopRaftEngine();
		this.remotePeerIds.forEach((peerId) => this.removeRemotePeerId(peerId));
		this.storages.forEach((storage) => storage.close());

		this.emit('close');

		logger.info('%s is closed', this.localPeerId);
	}

	public get stats() {
		const numberOfPendingRequests = this.grid.pendingRequests.size;
		const numberOfOngoingRequests = this.grid.ongoingRequestsNotifier.activeOngoingRequests.size;
		const numberOfRemotePeers = this.raft.remotePeers.size;
		const numberOfPendingResponses = this.grid.pendingResponses.size;
		const raftLogsBytesInMemory = this.raft.logs.bytesInMemory;

		return {
			/**
			 * Number of requests sent out from the grid, but waiting for response from remote peer
			 */
			numberOfPendingRequests,

			/**
			 * Number of requests received by this peer and queued for processing (for example requests to be waited to be committed by the leader)
			 */
			numberOfOngoingRequests,

			/**
			 * Number of responses received by this peer and queued for processing as the response were chunked
			 */
			numberOfPendingResponses,

			/**
			 * Number of remote peers this peer is connected to
			 */
			numberOfRemotePeers,

			/**
			 * Number of bytes used by the raft logs in memory
			 */
			raftLogsBytesInMemory,
		};
	}

	private _acceptCommit(commitIndex: number, message: HamokMessage): void {
		logger.trace('%s accepted committed message %o', this.localPeerId, message);
		
		// if we put this request to hold when we accepted the submit request we remove the ongoing request notification
		// so from this moment it is up to the storage / pubsub to accomplish the request
		if (message.requestId && this.grid.ongoingRequestsNotifier.has(message.requestId)) {
			this.grid.ongoingRequestsNotifier.remove(message.requestId);

			logger.trace('%s Request %s is removed ongoing requests', this.localPeerId, message.requestId);
		}
		this.accept(message, commitIndex);
	}

	public addRemotePeerId(remoteEndpointId: string): void {
		if (this._closed) throw new Error('Cannot add remote peer to a closed Hamok instance');
		if (remoteEndpointId === this.localPeerId) return;
		if (this.raft.remotePeers.has(remoteEndpointId)) return;

		this.raft.remotePeers.add(remoteEndpointId);

		logger.debug('%s added remote peer %s', this.localPeerId, remoteEndpointId);

		this.emit('remote-peer-joined', remoteEndpointId);
	}

	public removeRemotePeerId(remoteEndpointId: string): void {
		if (!this.raft.remotePeers.delete(remoteEndpointId)) return;

		logger.debug('%s removed remote peer %s', this.localPeerId, remoteEndpointId);

		this.emit('remote-peer-left', remoteEndpointId);

		// if (this.remotePeerIds.size === 0) {
		// 	if (this._closed || !this._run) return;
		// 	this.join({
		// 		// we retry indefinitely if we lost the connection
		// 		maxRetry: -1,
		// 		// 
		// 		fetchRemotePeerTimeoutInMs: 5000,
		// 	}).catch((err) => {
		// 		logger.error('Failed to rejoin the grid', err);
		// 	});
		// } else {
		// 	// if I am not the leader I need to fetch the remote peers or at least check who is alive and who is not to be sure we are in the network
		// }
	}

	/**
	 * Wait until the commit head (the most recent spread commit by the leader) is reached
	 * @returns 
	 */
	public async waitUntilCommitHead(): Promise<void> {
		if (this._closed) throw new Error('Cannot wait until commit head on a closed Hamok instance');

		const actualCommitHead = this.raft.logs.nextIndex - 1;

		if (actualCommitHead <= this.raft.logs.commitIndex) return;
		
		return new Promise((resolve) => {
			const listener = (commitIndex: number) => {
				if (commitIndex < actualCommitHead) return;
				this.off('commit', listener);
				resolve();
			};

			this.on('commit', listener);
		});
	}

	public async waitUntilLeader(): Promise<void> {
		if (this._closed) throw new Error('Cannot wait until leader on a closed Hamok instance');

		if (this.raft.leaderId !== undefined) return;

		return new Promise((resolve) => {
			const listener = () => {
				if (!this.raft.leaderId === undefined) return;
				this.off('leader-changed', listener);
				resolve();
			};

			this.on('leader-changed', listener);
		});
	}

	public createMap<K, V>(options: HamokMapBuilderConfig<K, V>): HamokMap<K, V> {
		if (this._closed) throw new Error('Cannot create map on a closed Hamok instance');
		if (this.storages.has(options.mapId)) throw new Error(`Map with id ${options.mapId} already exists`);

		const connection = this._createStorageConnection(
			{
				...options,
				keyCodec: options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
				valueCodec: options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.UPDATE_ENTRIES_REQUEST,
				]),
				storageId: options.mapId,
			},
		);

		const storage = new HamokMap<K, V>(
			connection,
			options.baseMap ?? new MemoryBaseMap<K, V>(),
			options.equalValues,
		);

		storage.once('close', () => {
			this.storages.delete(storage.id);
		});
		
		this.storages.set(storage.id, storage);

		return storage;
	}

	public getOrCreateMap<K, V>(options: HamokMapBuilderConfig<K, V>, callback?: (alreadyExisted: boolean) => void): HamokMap<K, V> {
		const storage = this.storages.get(options.mapId) as HamokMap<K, V>;

		if (!storage) return this.createMap(options);

		callback?.(true);
		
		return storage;
	}

	public createRemoteMap<K, V>(options: HamokRemoteMapBuilderConfig<K, V>): HamokRemoteMap<K, V> {
		if (this._closed) throw new Error('Cannot create remote map on a closed Hamok instance');
		if (this.storages.has(options.mapId)) throw new Error(`Remote map with id ${options.mapId} already exists`);

		const connection = this._createStorageConnection<K, V>( 
			{
				...options,
				keyCodec: options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
				valueCodec: options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.UPDATE_ENTRIES_REQUEST,
				]),
				storageId: options.mapId,
			},
		);

		const storage = new HamokRemoteMap<K, V>(
			connection,
			options.remoteMap,
			options.equalValues,
		);

		storage.once('close', () => {
			this.storages.delete(storage.id);
		});
		
		this.storages.set(storage.id, storage);

		return storage;
	}

	public getOrCreateRemoteMap(options: HamokRemoteMapBuilderConfig<unknown, unknown>, callback?: (alreadyExisted: boolean) => void): HamokRemoteMap<unknown, unknown> {
		const storage = this.storages.get(options.mapId) as HamokRemoteMap<unknown, unknown>;

		if (!storage) return this.createRemoteMap(options);

		callback?.(true);
		
		return storage;
	}

	public createRecord<T extends HamokRecordObject>(options: HamokRecordBuilderConfig<T>): HamokRecord<T> {
		if (this._closed) throw new Error('Cannot create record on a closed Hamok instance');
		if (this.storages.has(options.recordId)) throw new Error(`Record with id ${options.recordId} already exists`);

		const connection = this._createStorageConnection( 
			{
				...options,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.UPDATE_ENTRIES_REQUEST,
				]),
				storageId: options.recordId,
				keyCodec: createStrToUint8ArrayCodec(),
				valueCodec: createStrToUint8ArrayCodec(),
			},
		);

		const storage = new HamokRecord<T>(
			connection, {
				equalValues: options.equalValues,
				payloadsCodec: options.payloadCodecs,
				initalObject: options.initialObject,
			}
		);

		storage.once('close', () => {
			this.storages.delete(storage.id);
		});
		
		this.storages.set(storage.id, storage);

		return storage;
	}

	public getOrCreateRecord<T extends HamokRecordObject>(options: HamokRecordBuilderConfig<T>, callback?: (alreadyExisted: boolean) => void): HamokRecord<T> {
		const storage = this.storages.get(options.recordId) as HamokRecord<T>;

		if (!storage) return this.createRecord(options);

		callback?.(true);
		
		return storage;
	}

	public createQueue<T>(options: HamokQueueBuilderConfig<T>): HamokQueue<T> {
		if (this._closed) throw new Error('Cannot create queue on a closed Hamok instance');

		const connection = this._createStorageConnection( 
			{
				...options,
				keyCodec: createHamokJsonBinaryCodec<number>(),
				valueCodec: options.codec ?? createHamokJsonBinaryCodec<T>(),
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
				]),
				storageId: options.queueId,
			},
		);

		const storage = new HamokQueue<T>(
			connection,
			options.baseMap ?? new MemoryBaseMap<number, T>(),
		);

		storage.once('close', () => {
			this.storages.delete(storage.id);
		});
		
		this.storages.set(storage.id, storage);

		return storage;
	}

	public getOrCreateQueue<T>(options: HamokQueueBuilderConfig<T>, callback?: (alreadyExisted: boolean) => void): HamokQueue<T> {
		const storage = this.storages.get(options.queueId) as HamokQueue<T>;

		if (!storage) return this.createQueue(options);

		callback?.(true);
		
		return storage;
	}

	public createEmitter<T extends HamokEmitterEventMap>(options: HamokEmitterBuilderConfig<T>): HamokEmitter<T> {
		if (this._closed) throw new Error('Cannot create emitter on a closed Hamok instance');

		const connection = this._createStorageConnection<string, string>( 
			{
				...options,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
				]),
				storageId: options.emitterId,
				keyCodec: createStrToUint8ArrayCodec(),
				valueCodec: createStrToUint8ArrayCodec(),
			},
		);

		const storage = new HamokEmitter<T>(
			connection,
			options.payloadsCodec,
		);

		connection.once('close', () => {
			this.storages.delete(storage.id);
		});
		
		this.storages.set(storage.id, storage);

		return storage;
	}

	public getOrCreateEmitter<T extends HamokEmitterEventMap>(options: HamokEmitterBuilderConfig<T>, callback?: (alreadyExisted: boolean) => void): HamokEmitter<T> {
		const storage = this.storages.get(options.emitterId) as HamokEmitter<T>;

		if (!storage) return this.createEmitter(options);

		callback?.(true);
		
		return storage;
	}

	public async submit(entry: HamokMessage): Promise<void> {
		if (this._closed) throw new Error('Cannot submit on a closed Hamok instance');
		if (!this.raft.leaderId) {
			const error = new Error(`No leader is elected, cannot submit message type ${entry.type}`);

			if (!this.emit('error', error)) throw error;
			
			return;
		}
		
		entry.sourceId = this.localPeerId;

		if (this.leader) {
			const success = this.raft.submit(entry);

			if (success && entry.requestId && entry.storageId && entry.sourceId) {
				// we add the request to the ongoing requests set to prevent timeout at the follower side
				// when the leader is processing the request until it commits the log entry
				this.grid.ongoingRequestsNotifier.add({
					remotePeerId: entry.sourceId,
					requestId: entry.requestId,
					storageId: entry.storageId,
				});
    
				logger.trace('%s Request %s is added to ongoing requests set', this.localPeerId, entry.requestId);
			}
			
			return;
		}
		const request = new SubmitMessageRequest(
			uuid(),
			this.localPeerId,
			entry,
			this.raft.leaderId,
		);
		const message = this._codec.encodeSubmitMessageRequest(request);

		message.protocol = HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL;

		const response = (await this.grid.request({
			message,
			neededResponses: 1,
			targetPeerIds: [ this.raft.leaderId ],
			timeoutInMs: 5000,
		})).map((msg) => this._codec.decodeSubmitMessageResponse(msg))?.[0];

		if (response?.success === false && 
            response.leaderId && 
            response.leaderId !== request.destinationEndpointId && 
            response.leaderId === this.raft.leaderId
		) {
			// the leader changed meanwhuile the submit request was sent
			logger.debug('Leader changed from %s to %s, submit will be resend to the new leader', this.raft.leaderId, response.leaderId);
			
			return this.submit(message);
		}
        
		if (!response?.success) {
			throw new Error('Failed to submit message');
		}
	}

	public accept(message: HamokMessage, commitIndex?: number): void {
		if (this._closed) return;
		if (message.destinationId && message.destinationId !== this.localPeerId) {
			return logger.trace('%s Received message address is not matching with the local peer %o', this.localPeerId, message);
		}

		// if (message.protocol !== HamokMessageProtocol.RAFT_COMMUNICATION_PROTOCOL) 
		logger.trace('%s received message %o', this.localPeerId, message);

		switch (message.type) {
			case HamokMessageType.GET_ENTRIES_RESPONSE:
			case HamokMessageType.GET_KEYS_RESPONSE:
			case HamokMessageType.GET_SIZE_RESPONSE:
			case HamokMessageType.CLEAR_ENTRIES_RESPONSE:
			case HamokMessageType.DELETE_ENTRIES_RESPONSE:
			case HamokMessageType.REMOVE_ENTRIES_RESPONSE:
			case HamokMessageType.INSERT_ENTRIES_RESPONSE:
			case HamokMessageType.UPDATE_ENTRIES_RESPONSE:
			case HamokMessageType.SUBMIT_MESSAGE_RESPONSE:
				// raft relatd messages are different animal
				// case HamokMessageType.RAFT_APPEND_ENTRIES_RESPONSE
				// case HamokMessageType.
				return this.grid.processResponse(message);
		}

		switch (message.protocol) {
			case HamokMessageProtocol.RAFT_COMMUNICATION_PROTOCOL:
				switch (message.type) {
					case HamokMessageType.RAFT_APPEND_ENTRIES_REQUEST_CHUNK:
					case HamokMessageType.RAFT_APPEND_ENTRIES_RESPONSE:
					case HamokMessageType.RAFT_VOTE_REQUEST:
					case HamokMessageType.RAFT_VOTE_RESPONSE:
						this._acceptKeepAliveHamokMessage(message);
						break;
				}
				this.raft.transport.receive(message);
				break;
			// case undefined:
			case HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL:
				this._acceptGridMessage(message);
				break;
			case HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL: {
				const storage = this.storages.get(message.storageId ?? '');

				if (!storage) {
					if (message.type === HamokMessageType.STORAGE_HELLO_NOTIFICATION) {
						// we reply to this in any case

						return (this._emitMessage(new HamokMessage({
							protocol: HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL,
							type: HamokMessageType.STORAGE_STATE_NOTIFICATION,
							sourceId: this.localPeerId,
							destinationId: message.sourceId,
							storageId: message.storageId,
							raftCommitIndex: -1,
						})), void 0);
					}
					
					return logger.trace('Received message for unknown collection %s', message.storageId);
				}
				
				return storage.connection.accept(message, commitIndex);
			}
			// case HamokMessageProtocol.PUBSUB_COMMUNICATION_PROTOCOL:
			// 	this._dispatchToPubSub(message);
			default:
				return logger.warn('%s Unknown protocol %s, message: %o', this.localPeerId, message.protocol, message);
		}
	}

	public async leave() {
		if (this._closed) throw new Error('Cannot leave the network on a closed hamok');
		if (!this._run) return;

		logger.debug('%s Leaving the network', this.localPeerId);

		try {
			await this._joining?.catch(() => void 0);

			this._run = false;
			this._stopRaftEngine();
			[ ...this.remotePeerIds ].forEach((peerId) => this.removeRemotePeerId(peerId));

			this.emit('left');
			
			logger.info('%s Left the network', this.localPeerId);

		} finally {
			this._run = false;
		}
	}

	public async join(params?: HamokJoinProcessParams): Promise<void> {
		if (this._closed) throw new Error('Cannot execute join on a closed hamok');
		if (this._joining) return this._joining;
		if (this.raft.leaderId !== undefined) return logger.warn('Already joined the network as %s', this.localPeerId);

		if (0 < this.remotePeerIds.size) {
			// we can issue a fetchRequest and then wait for the leader in this case, but we don't have to issue a new join???
		}

		try {
			if (this._run) {
				this.emit('rejoining');
			}
			this._run = true;

			this._joining = this._join({
				fetchRemotePeerTimeoutInMs: params?.fetchRemotePeerTimeoutInMs ?? 5000,
				maxRetry: params?.maxRetry ?? 3,
			});

			await this._joining;

		} finally {
			this._joining = undefined;
		}
	}

	private async _join(params: Required<HamokJoinProcessParams>, retried = 0): Promise<void> {
		if (this._closed) throw new Error('Cannot join the network on a closed hamok');
		
		const {
			fetchRemotePeerTimeoutInMs,
			maxRetry,
		} = params ?? {};

		logger.debug('%s Joining the network. startAfterJoin: %s, fetchRemotePeerTimeoutInMs: %s, maxRetry: %s',
			this.localPeerId, fetchRemotePeerTimeoutInMs, maxRetry
		);

		this._stopRaftEngine();
		
		await new Promise<void>((resolve) => {
			const started = Date.now();

			this._lookingForRemotePeers = {
				timer: setInterval(() => {
					const joinMsg = this._codec.encodeJoinNotification(new JoinNotification(this.localPeerId));
					const now = Date.now();

					this._emitMessage(joinMsg);

					if (now - started < fetchRemotePeerTimeoutInMs) return;

					clearInterval(this._lookingForRemotePeers?.timer);
					this._lookingForRemotePeers = undefined;
					resolve();
				}, this.raft.config.heartbeatInMs),
				close: () => {
					logger.warn('%s Stopping looking for remote peers', this.localPeerId);
					clearInterval(this._lookingForRemotePeers?.timer);
					this._lookingForRemotePeers = undefined;
					resolve();
				},
			};
		});
		
		if (this.remotePeerIds.size < 1) {
			if (0 <= maxRetry && maxRetry <= retried) throw new Error('No remote peers found');

			logger.warn('%s No remote peers found, retrying %s/%s', this.localPeerId, retried, maxRetry < 0 ? '∞' : maxRetry);

			return this._join(params, retried + 1);
		}

		this._startRaftEngine();

		let leaderElected: () => void | undefined;
		let noMoreRemotePeers: () => void | undefined;
			
		await new Promise<void>(
			(resolve, reject) => {
				leaderElected = () => {
					if (this.raft.leaderId === undefined) return;

					resolve();
					this.emit('joined');
				};
				noMoreRemotePeers = () => (this.remotePeerIds.size === 0 ? reject(new Error('Remote peers are gone while joining')) : void 0);

				this.on('leader-changed', leaderElected);
				this.on('remote-peer-left', noMoreRemotePeers);

				// now we start the engine
				this._startRaftEngine();
			})
			.catch((err) => {
				if (this._closed) throw err;
				logger.warn('Failed to join the network %o', err);

				return this._join(params, retried + 1);
			})
			.finally(() => {
				this.off('leader-changed', leaderElected);
				this.off('remote-peer-left', noMoreRemotePeers);
			});
	}

	private _startRaftEngine(): void {
		if (this._raftTimer) {
			return logger.debug('Hamok is already running');
		}
		const raftEngine = this.raft;

		raftEngine.transport.on('message', this._emitMessage);
		raftEngine.state = createRaftFollowerState({
			raftEngine,
		});
		this._raftTimer = setInterval(() => {
			raftEngine.state.run();
			
			this.emit('heartbeat');
		}, raftEngine.config.heartbeatInMs);
	}

	private _stopRaftEngine() {
		if (!this._raftTimer) {
			return;
		}
		const raftEngine = this.raft;

		logger.debug('%s Stopping the raft engine', this.localPeerId);
		clearInterval(this._raftTimer);
		this._raftTimer = undefined;
		
		raftEngine.state = createRaftEmptyState({
			raftEngine,
		});
		
		raftEngine.transport.off('message', this._emitMessage);
		this._remoteHeartbeats.forEach((timer) => clearTimeout(timer));
		this._remoteHeartbeats.clear();
	}

	private _sendEndpointNotification(destinationIdPeerId: string, snapshot?: string, requestId?: string): void {
		const notification = new EndpointStatesNotification(
			this.localPeerId,
			destinationIdPeerId,
			this.raft.props.currentTerm,
			this.raft.logs.commitIndex,
			this.leader ? this.raft.logs.nextIndex : -1,
			this.raft.logs.size,
			this.raft.remotePeers,
			snapshot,
			requestId
		);

		logger.trace('%s Sending endpoint state notification %o, snapshot: %o', this.localPeerId, notification, snapshot);

		const message = this._codec.encodeEndpointStateNotification(notification);

		this._emitMessage(message, destinationIdPeerId);
	}

	private _acceptGridMessage(message: HamokMessage): void {
		if (this._closed) return;

		switch (message.type) {
			case HamokMessageType.HELLO_NOTIFICATION: {
				logger.debug('%s Received hello notification from %s', this.localPeerId, message.sourceId);
				break;
			}
			case HamokMessageType.JOIN_NOTIFICATION: {
				const notification = this._codec.decodeJoinNotification(message);

				if (notification.sourcePeerId === this.localPeerId) {
					logger.trace('%s Received join notification from itself %o', this.localPeerId, notification);
					break;
				}
				if (this.raft.leaderId === this.localPeerId) {
					this._sendEndpointNotification(notification.sourcePeerId, undefined);
				}
				this.addRemotePeerId(notification.sourcePeerId);

				break;
			}
			case HamokMessageType.ENDPOINT_STATES_NOTIFICATION: {
				const endpointStateNotification = this._codec.decodeEndpointStateNotification(message);

				if (endpointStateNotification.sourceEndpointId === this.localPeerId) {
					return logger.trace('%s Received endpoint state notification from itself %o', this.localPeerId, endpointStateNotification);
				}

				logger.warn('%s Received endpoint state notification %o, activeEndpointIds: %s', this.localPeerId, endpointStateNotification, [ ...(endpointStateNotification.activeEndpointIds ?? []) ].join(', '));

				for (const peerId of this.remotePeerIds) {
					logger.trace('%s Remote peer %s is in the active endpoints', this.localPeerId, peerId);
					if (endpointStateNotification.activeEndpointIds?.has(peerId)) continue;
					if (endpointStateNotification.sourceEndpointId === peerId) continue;
						
					logger.debug('%s Received endpoint state notification from %s (supposed to be the leader), and in that it does not have %s in its active endpoints, therefore we need to remove it', 
						this.localPeerId, 
						endpointStateNotification.sourceEndpointId, 
						peerId, 
					);

					this.removeRemotePeerId(peerId);
				}

				for (const peerId of endpointStateNotification.activeEndpointIds ?? []) {
					if (this.remotePeerIds.has(peerId)) continue;
					if (peerId === this.localPeerId) continue;

					logger.debug('%s Received endpoint state notification from %s (supposed to be the leader), and in that it has %s in its active endpoints, therefore we need to add it',
						this.localPeerId,
						endpointStateNotification.sourceEndpointId,
						peerId
					);

					this.addRemotePeerId(peerId);
				}
				
				if (!this.remotePeerIds.has(endpointStateNotification.sourceEndpointId)) {
					this.addRemotePeerId(endpointStateNotification.sourceEndpointId);
				}

				// we add 2 becasue the nextIndex of the leader has not been reserved, and 
				const possibleLowestIndex = endpointStateNotification.leaderNextIndex - endpointStateNotification.numberOfLogs + 2; 

				if (0 < endpointStateNotification.commitIndex && 
					this.raft.logs.nextIndex < endpointStateNotification.leaderNextIndex && 
					this.raft.logs.firstIndex < possibleLowestIndex
				) {
					// we make a warn message only if it is not the first join

					logger.warn('%s Commit index of this peer (%d) is lower than the smallest commit index (%s) from remote peers resetting the logs', 
						this.localPeerId, 
						this.raft.logs.commitIndex,
						possibleLowestIndex
					);
					this.raft.logs.reset(possibleLowestIndex);
				}

				this._lookingForRemotePeers?.close();
				
				break;
			}
			case HamokMessageType.ONGOING_REQUESTS_NOTIFICATION: {
				const ongoingRequestNotification = this._codec.decodeOngoingRequestsNotification(message);

				for (const requestId of ongoingRequestNotification.requestIds) {
					const pendingRequest = this.grid.pendingRequests.get(requestId);

					if (!pendingRequest) {
						logger.warn('%s Received ongoing request notification for unknown request %s', this.localPeerId, requestId);
						continue;
					}

					pendingRequest.postponeTimeout();
				}
				break;
			}
			case HamokMessageType.SUBMIT_MESSAGE_REQUEST: {
				const request = this._codec.decodeSubmitMessageRequest(message);
				const entry = request.entry;
				const success = this.leader ? this.raft.submit(request.entry) : false;
				const response = request.createResponse(success, this.raft.leaderId);

				logger.trace('%s Received submit message request %o. success: %s, leader: %s leaderId: %s, raftState: %s', 
					this.localPeerId, 
					request, 
					success,
					this.leader,
					this.raft.leaderId,
					this.raft.state.stateName
				);

				if (success && this.leader && entry.requestId && entry.storageId && entry.sourceId) {
					// we add the request to the ongoing requests set to prevent timeout at the follower side
					// when the leader is processing the request until it commits the log entry
					this.grid.ongoingRequestsNotifier.add({
						remotePeerId: entry.sourceId,
						requestId: entry.requestId,
						storageId: entry.storageId,
					});

					logger.trace('%s Request %s is added to ongoing requests set', this.localPeerId, entry.requestId);
				}

				this.grid.sendMessage(
					this._codec.encodeSubmitMessageResponse(response),
					message.sourceId
				);
				break;
			}
		}
	}

	private _sendEndpointNotificationsToAll(): void {
		for (const remotePeerId of this.remotePeerIds) {
			this._sendEndpointNotification(remotePeerId);
		}
	}

	private _acceptLeaderChanged(leaderId: string | undefined): void {
		for (const collection of this.storages.values()) {
			collection.connection.emit('leader-changed', leaderId);
		}

		if (this.localPeerId === leaderId) {
			this.on('remote-peer-joined', this._sendEndpointNotificationsToAll);
			this.on('remote-peer-left', this._sendEndpointNotificationsToAll);
		} else {
			this.off('remote-peer-joined', this._sendEndpointNotificationsToAll);
			this.off('remote-peer-left', this._sendEndpointNotificationsToAll);

			if (leaderId === undefined) {
				if (this._closed || !this._run) return;

				logger.warn('%s detected that Leader is gone, clearing the remote peers', this.localPeerId);
				// this._stopRaftEngine();
				[ ...this.remotePeerIds ].forEach((peerId) => this.removeRemotePeerId(peerId));

				this.join({
					fetchRemotePeerTimeoutInMs: 5000,
					maxRetry: -1,
				}).catch((err) => {
					logger.error('Failed to rejoin the grid', err);
				});
			}
		}
	}

	private _emitRemotePeerRemoved(remotePeerId: string): void {
		for (const collection of this.storages.values()) {
			collection.connection.emit('remote-peer-removed', remotePeerId);
		}
	}

	private _emitMessage(
		message: HamokMessage, 
		destinationPeerIds?: ReadonlySet<string> | string[] | string,
		protocol?: HamokMessageProtocol
	) {
		message.sourceId = this.localPeerId;

		if (protocol) {
			message.protocol = protocol;
		}

		// if (message.type === HamokMessageType.ENTRY_UPDATED_NOTIFICATION) 
		// 	logger.warn('%s sending message %o', this.localPeerId, message);

		if (!destinationPeerIds) {
			return this.emit('message', message);
		}
		let remotePeers: ReadonlySet<string>;

		if (typeof destinationPeerIds === 'string') {
			remotePeers = new Set([ destinationPeerIds ]);
		} else if (Array.isArray(destinationPeerIds)) {
			remotePeers = new Set(destinationPeerIds);
		} else {
			remotePeers = destinationPeerIds;
		}

		if (remotePeers.size < 1) {
			return logger.warn('Empty set of destination has been provided for request %o', message);   
		} 
		
		if (remotePeers.size === 1) {
			return [ ...remotePeers ].forEach((destinationId) => {
				message.destinationId = destinationId;
				if (message.destinationId === this.localPeerId) {
					return this.accept(message);
				}
				
				this.emit('message', message);
			});
		}

		for (const destinationId of remotePeers) {
			if (destinationId === this.localPeerId) {
				return this.accept(message);
			}

			this.emit('message', new HamokMessage({
				...message,
				destinationId
			}));
		}
	}

	private _createStorageConnection<K, V>(
		options: Partial<HamokConnectionConfig> & { storageId: string, keyCodec?: HamokCodec<K, Uint8Array>, valueCodec?: HamokCodec<V, Uint8Array>}
	): HamokConnection<K, V> {

		const storageCodec = new StorageCodec<K, V>(
			options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
			options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
		);
		const connection = new HamokConnection<K, V>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.storageId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundKeys ?? 0,
				maxOutboundValues: options.maxOutboundKeys ?? 0,
				remoteStorageStateWaitingTimeoutInMs: options.remoteStorageStateWaitingTimeoutInMs ?? 1000,
				submitting: options.submitting,
			}, 
			storageCodec, 
			this.grid,         
			this.waitUntilCommitHead.bind(this),
		);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};

		connection.once('close', () => {
			connection.off('message', messageListener);
		});
		connection.on('message', messageListener);
		
		return connection;
	}

	// private _checkRemotePeers(): void {
	// 	if (!this._closed) return;
	// 	if (this._lookingForRemotePeers) {
	// 		return;
	// 	}

	// 	// if the leader is elected, we don't need to check the remote peers
	// 	if (this.raft.leaderId !== undefined || !this._run) return;

	// 	logger.debug('_checkRemotePeers(): %s checking remote peers', this.localPeerId);
	// 	this._lookingForRemotePeers = setInterval(() => {
	// 		const joinMsg = this._codec.encodeJoinNotification(new JoinNotification(this.localPeerId));

	// 		// this will trigger the remote endpoint to add this endpoint
	// 		this._emitMessage(joinMsg);
	// 	}, Math.max(this.raft.config.followerMaxIdleInMs / 5, 100));
	// }

	private _acceptKeepAliveHamokMessage(message: HamokMessage) {
		if (!message.sourceId || message.sourceId === this.localPeerId) return;
		const remotePeerId = message.sourceId;
		
		this._addNoHeartbeatTimer(remotePeerId);
	}

	private _addNoHeartbeatTimer(remotePeerId: string) {
		clearTimeout(this._remoteHeartbeats.get(remotePeerId));
		
		logger.trace('%s Add no heartbeat timeout for %s', this.localPeerId, remotePeerId);

		const timer = setTimeout(() => {
			this._remoteHeartbeats.delete(remotePeerId);

			if (this._joining) {
				return this._addNoHeartbeatTimer(remotePeerId);
			}
			this.emit('no-heartbeat-from', remotePeerId);
		}, this.raft.config.electionTimeoutInMs);

		this._remoteHeartbeats.set(remotePeerId, timer);
	}
}
