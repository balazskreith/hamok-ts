import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { RaftEngine, RaftEngineConfig } from './raft/RaftEngine';
import { HamokMessage, HamokMessage_MessageType as HamokMessageType, HamokMessage_MessageProtocol as HamokMessageProtocol } from './messages/HamokMessage';
import { MemoryStoredRaftLogs } from './raft/MemoryStoredRaftLogs';
import { createRaftFollowerState } from './raft/RaftFollowerState';
import { LogEntry } from './raft/LogEntry';
import { RaftStateName } from './raft/RaftState';
import { HamokMap } from './collections/HamokMap';
import { HamokConnection } from './collections/HamokConnection';
import { OngoingRequestsNotifier } from './messages/OngoingRequestsNotifier';
import { createHamokJsonBinaryCodec, createHamokJsonStringCodec, createNumberToUint8ArrayCodec, createStrToUint8ArrayCodec, HamokCodec } from './common/HamokCodec';
import { StorageCodec } from './messages/StorageCodec';
import { BaseMap, MemoryBaseMap } from './collections/BaseMap';
import { createLogger } from './common/logger';
import { HamokGridCodec } from './messages/HamokGridCodec';
import { SubmitMessageRequest } from './messages/messagetypes/SubmitMessage';
import { HamokGrid } from './HamokGrid';
import { createRaftEmptyState } from './raft/RaftEmptyState';
import { HamokSnapshot } from './HamokSnapshot';
import { HamokQueue } from './collections/HamokQueue';
import { HamokEmitter, HamokEmitterEventMap } from './collections/HamokEmitter';
import { RaftLogs } from './raft/RaftLogs';
import { HamokRecord, HamokRecordObject } from './collections/HamokRecord';
import { HelloNotification } from './messages/messagetypes/HelloNotification';
import { EndpointStatesNotification } from './messages/messagetypes/EndpointNotification';
import { JoinNotification } from './messages/messagetypes/JoinNotification';
import { RemoteMap } from './collections/RemoteMap';
import { HamokRemoteMap } from './collections/HamokRemoteMap';

const logger = createLogger('Hamok');

type HamokHelloNotificationCustomRequestType = 'snapshot';

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
	
	/**
	 * Indicate if the remote peers automatically should be removed if no heartbeat is received.
	 * 
	 * DEFAULT: true
	 */
	removeRemotePeersOnNoHeartbeat?: boolean,

	/**
	 * indicates if the snapshot should be requested from the remote peers, 
	 * and if it is provided then it is used in local
	 * 
	 * DEFAULT: true
	 */
	requestSnapshot?: boolean,

	/**
	 * indicates if the start() method should be called automatically after the join process is completed
	 * 
	 * DEFAULT: false
	 */
	startAfterJoin?: boolean,
}

export type HamokConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {

	/**
	 * Indicate if the Hamok should stop automatically when there are no remote peers.
	 */
	autoStopOnNoRemotePeers?: boolean,

	/**
	 * A custom appData object to be used by the application utilizes Hamok.
	 */
	appData?: AppData,
}

/**
 * Configuration settings for the Hamok constructor, extending RaftEngineConfig and HamokConfig.
 */
export type HamokConstructorConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = RaftEngineConfig & HamokConfig<AppData> & {

	/**
	 * Optional. The expiration time in milliseconds for log entries.
	 * Log entries older than this duration may be purged.
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

	/**
	 * Optional. In case snapshots are requested by a join operation this is the codec to encode and decode the snapshot.
	 * 
	 * DEFAULT: JSON codec
	 */
	snapshotCodec?: HamokCodec<HamokSnapshot, string>,
}

/**
 * Configuration settings for building a Hamok record.
 */
export type HamokRecordBuilderConfig<T extends HamokRecordObject> = {

	/**
	 * The unique identifier for the record.
	 */
	recordId: string,

	/**
	 * Optional. The timeout duration in milliseconds for requests.
	 */
	requestTimeoutInMs?: number,

	/**
	 * Optional. The maximum waiting time in milliseconds for a message to be sent.
	 * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
	 */
	maxMessageWaitingTimeInMs?: number,

	/**
	 * Optional. A map of payload codecs for encoding and decoding record properties.
	 * The key is a property of the record, and the value is a codec for that property.
	 */
	payloadCodecs?: Map<keyof T, HamokCodec<T[keyof T], string>>,

	/**
	 * Optional. The maximum number of keys allowed in request or response messages.
	 */
	maxOutboundMessageKeys?: number,

	/**
	 * Optional. The maximum number of values allowed in request or response messages.
	 */
	maxOutboundMessageValues?: number,

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
export type HamokMapBuilderConfig<K, V> = {

	/**
	 * The unique identifier for the map.
	 */
	mapId: string,

	/**
	 * Optional. The timeout duration in milliseconds for requests.
	 */
	requestTimeoutInMs?: number,

	/**
	 * Optional. The maximum waiting time in milliseconds for a message to be sent.
	 * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
	 */
	maxMessageWaitingTimeInMs?: number,

	/**
	 * Optional. A codec for encoding and decoding keys in the map.
	 */
	keyCodec?: HamokCodec<K, Uint8Array>,

	/**
	 * Optional. A codec for encoding and decoding values in the map.
	 */
	valueCodec?: HamokCodec<V, Uint8Array>,

	/**
	 * Optional. The maximum number of keys allowed in request or response messages.
	 */
	maxOutboundMessageKeys?: number,

	/**
	 * Optional. The maximum number of values allowed in request or response messages.
	 */
	maxOutboundMessageValues?: number,

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
export type HamokQueueBuilderConfig<T> = {

	/**
	 * The unique identifier for the queue.
	 */
	queueId: string,

	/**
	 * Optional. A codec for encoding and decoding items in the queue.
	 */
	codec?: HamokCodec<T, Uint8Array>,

	/**
	 * Optional. The timeout duration in milliseconds for requests.
	 */
	requestTimeoutInMs?: number,

	/**
	 * Optional. The maximum waiting time in milliseconds for a message to be sent.
	 * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
	 */
	maxMessageWaitingTimeInMs?: number,

	/**
	 * Optional. The maximum number of keys allowed in request or response messages.
	 */
	maxOutboundMessageKeys?: number,

	/**
	 * Optional. The maximum number of values allowed in request or response messages.
	 */
	maxOutboundMessageValues?: number,

	/**
	 * Optional. A base map to be used as the initial state of the queue.
	 */
	baseMap?: BaseMap<number, T>,

	/**
	 * Optional. The length of byte array used for queue keys.
	 * Can be 2, 4, or 8 bytes.
	 */
	lengthOfBytesQueueKeys?: 2 | 4 | 8,
}

/**
 * Configuration settings for building a Hamok emitter.
 */
export type HamokEmitterBuilderConfig<T extends HamokEmitterEventMap> = {

	/**
	 * The unique identifier for the emitter.
	 */
	emitterId: string,

	/**
	 * Optional. The timeout duration in milliseconds for requests.
	 */
	requestTimeoutInMs?: number,

	/**
	 * Optional. The maximum waiting time in milliseconds for a message to be sent.
	 * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
	 */
	maxMessageWaitingTimeInMs?: number,

	/**
	 * Optional. The maximum number of keys allowed in request or response messages.
	 */
	maxOutboundMessageKeys?: number,

	/**
	 * Optional. The maximum number of values allowed in request or response messages.
	 */
	maxOutboundMessageValues?: number,

	/**
	 * Optional. A map of payload codecs for encoding and decoding event payloads.
	 * The key is an event type, and the value is a codec for that event type.
	 */
	payloadsCodec?: Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>,
}

export type HamokFetchRemotePeersResponse = {
	remotePeers: string[],
	customResponses?: string[],
};

export type HamokEventMap = {
	started: [],
	stopped: [],
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
	// 'hello-notification': [remotePeerId: string, request: {
	// 	customData: string,
	// 	callback: (response: string) => void,
	// } | undefined],
	'no-heartbeat-from': [remotePeerId: string],
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface Hamok {
	on<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	once<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	emit<U extends keyof HamokEventMap>(event: U, ...args: HamokEventMap[U]): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Hamok<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly config: HamokConfig<AppData>;
	public readonly raft: RaftEngine;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly records = new Map<string, HamokRecord<any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly maps = new Map<string, HamokMap<any, any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly queues = new Map<string, HamokQueue<any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly emitters = new Map<string, HamokEmitter<any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly remoteMaps = new Map<string, HamokRemoteMap<any, any>>();

	private _joining?: Promise<void>;
	private _raftTimer?: ReturnType<typeof setInterval>;
	private _remoteStateRequest?: { timer: ReturnType<typeof setTimeout>, responses: EndpointStatesNotification[] };
	private readonly _remoteHeartbeats = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly _codec = new HamokGridCodec();
	public readonly grid: HamokGrid;

	private readonly _snapshotCodec: HamokCodec<HamokSnapshot, string>;

	public constructor(providedConfig?: Partial<HamokConstructorConfig<AppData>>) {
		super();
		this.setMaxListeners(Infinity);
		this._emitMessage = this._emitMessage.bind(this);
		this._emitLeaderChanged = this._emitLeaderChanged.bind(this);
		this._acceptCommit = this._acceptCommit.bind(this);
		this._emitRemotePeerRemoved = this._emitRemotePeerRemoved.bind(this);

		this._snapshotCodec = providedConfig?.snapshotCodec ?? createHamokJsonStringCodec();

		const raftLogs = providedConfig?.raftLogs ?? new MemoryStoredRaftLogs({
			expirationTimeInMs: providedConfig?.logEntriesExpirationTimeInMs ?? 0,
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
			() => this.raft.localPeerId,
			() => this.raft.leaderId
		);
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

	public get state(): RaftStateName {
		return this.raft.state.stateName;
	}

	public get run() {
		return Boolean(this._raftTimer); 
	}

	public start(): void {
		if (this._raftTimer) {
			return logger.debug('Hamok is already running');
		}
		const raftEngine = this.raft;

		raftEngine.transport.on('message', this._emitMessage);
		this.on('leader-changed', this._emitLeaderChanged);
		this.on('commit', this._acceptCommit);
		this.on('remote-peer-left', this._emitRemotePeerRemoved);

		raftEngine.state = createRaftFollowerState({
			raftEngine,
		});
		this._raftTimer = setInterval(() => {
			raftEngine.state.run();
			
			this.emit('heartbeat');
		}, raftEngine.config.heartbeatInMs);

		this.emit('started');
	}

	public stop() {
		if (!this._raftTimer) {
			return;
		}
		const raftEngine = this.raft;

		clearInterval(this._raftTimer);
		this._raftTimer = undefined;

		raftEngine.state = createRaftEmptyState({
			raftEngine,
		});
		
		raftEngine.transport.off('message', this._emitMessage);
		this.off('commit', this._acceptCommit);
		this.off('leader-changed', this._emitLeaderChanged);
		this.off('remote-peer-left', this._emitRemotePeerRemoved);

		this._remoteHeartbeats.forEach((timer) => clearTimeout(timer));
		this._remoteHeartbeats.clear();

		this.emit('stopped');
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

		if (this.remotePeerIds.size === 0) {
			if (this.config.autoStopOnNoRemotePeers) {
				this.stop();
			}
		}
	}

	public export(): HamokSnapshot {
		const result: HamokSnapshot = {
			meta: {
				created: Date.now(),
				peerId: this.localPeerId,
			},
			commitIndex: this.raft.logs.commitIndex,
			term: this.raft.props.currentTerm,
			records: [ ...this.records.values() ].map((record) => record.export()),
			maps: [ ...this.maps.values() ].map((storage) => storage.export()),
			queues: [ ...this.queues.values() ].map((queue) => queue.export()),
			emitters: [ ...this.emitters.values() ].map((emitter) => emitter.export()),
			remoteMaps: [ ...this.remoteMaps.values() ].map((storage) => storage.export()),
		};

		for (const storage of this.maps.values()) {
			result.maps.push(storage.export());
		}

		return result;
	}

	public import(snapshot: HamokSnapshot) {
		if (this._raftTimer) {
			throw new Error('Cannot import snapshot while running');
		}

		for (const recordSnapshot of snapshot.records) {
			const record = this.records.get(recordSnapshot.recordId);

			if (!record) {
				logger.warn('Cannot import record snapshot, because record %s is not found. snapshot: %o', recordSnapshot.recordId, recordSnapshot);
				continue;
			}

			record.import(recordSnapshot);
		}

		for (const mapSnapshot of snapshot.maps) {
			const map = this.maps.get(mapSnapshot.mapId);

			if (!map) {
				logger.warn('Cannot import map snapshot, because map %s is not found. snapshot: %o', mapSnapshot.mapId, mapSnapshot);
				continue;
			}

			map.import(mapSnapshot);
		}

		for (const queueSnapshot of snapshot.queues) {
			const queue = this.queues.get(queueSnapshot.queueId);

			if (!queue) {
				logger.warn('Cannot import queue snapshot, because queue %s is not found. snapshot: %o', queueSnapshot.queueId, queueSnapshot);
				continue;
			}

			queue.import(queueSnapshot);
		}

		for (const emitterSnapshot of snapshot.emitters) {
			const emitter = this.emitters.get(emitterSnapshot.emitterId);

			if (!emitter) {
				logger.warn('Cannot import emitter snapshot, because emitter %s is not found. snapshot: %o', emitterSnapshot.emitterId, emitterSnapshot);
				continue;
			}

			emitter.import(emitterSnapshot);
		}

		for (const remoteMapSnapshot of snapshot.remoteMaps) {
			const remoteMap = this.remoteMaps.get(remoteMapSnapshot.mapId);

			if (!remoteMap) {
				logger.warn('Cannot import remote map snapshot, because remote map %s is not found. snapshot: %o', remoteMapSnapshot.mapId, remoteMapSnapshot);
				continue;
			}

			remoteMap.import(remoteMapSnapshot);
		}

		const oldTerm = this.raft.props.currentTerm;
		const oldCommitIndex = this.raft.logs.commitIndex;

		this.raft.props.currentTerm = snapshot.term;
		this.raft.logs.reset(snapshot.commitIndex);

		logger.info('Snapshot created by peer %s at %s is imported. oldCommitIndex: %s, newCommitIndex: %s, oldTerm: %s, newTerm: %s', 
			snapshot.meta.peerId, 
			snapshot.meta.created, 
			oldCommitIndex, 
			this.raft.logs.commitIndex, 
			oldTerm, 
			this.raft.props.currentTerm
		);
	}

	/**
	 * Wait until the commit head (the most recent spread commit by the leader) is reached
	 * @returns 
	 */
	public async waitUntilCommitHead(): Promise<void> {
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

	public createMap<K, V>(options: HamokMapBuilderConfig<K, V>): HamokMap<K, V> {
		if (this.maps.has(options.mapId)) {
			throw new Error(`Map with id ${options.mapId} already exists`);
		}

		const storageCodec = new StorageCodec<K, V>(
			options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
			options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
		);
		const connection = new HamokConnection<K, V>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.mapId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundMessageKeys ?? 0,
				maxOutboundValues: options.maxOutboundMessageValues ?? 0,
				maxMessageWaitingTimeInMs: options.maxMessageWaitingTimeInMs,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.UPDATE_ENTRIES_REQUEST,
				])
			}, 
			storageCodec, 
			this.grid,         
		);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};
		const storage = new HamokMap<K, V>(
			connection,
			options.baseMap ?? new MemoryBaseMap<K, V>(),
			options.equalValues,
		);

		connection.once('close', () => {
			connection.off('message', messageListener);
			this.maps.delete(storage.id);
		});
		connection.on('message', messageListener);
		
		this.maps.set(storage.id, storage);

		return storage;
	}

	public getOrCreateMap<K, V>(options: HamokMapBuilderConfig<K, V>, callback?: (alreadyExisted: boolean) => void): HamokMap<K, V> {
		const existing = this.maps.get(options.mapId);

		try {
			if (existing) return existing;

			return this.createMap(options);
		} finally {
			callback?.(Boolean(existing));
		}
	}

	public createRemoteMap<K, V>(options: HamokRemoteMapBuilderConfig<K, V>): HamokRemoteMap<K, V> {
		if (this.remoteMaps.has(options.mapId)) {
			throw new Error(`RemoteMap with id ${options.mapId} already exists`);
		}

		const storageCodec = new StorageCodec<K, V>(
			options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
			options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
		);
		const connection = new HamokConnection<K, V>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.mapId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundMessageKeys ?? 0,
				maxOutboundValues: options.maxOutboundMessageValues ?? 0,
				maxMessageWaitingTimeInMs: options.maxMessageWaitingTimeInMs,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.UPDATE_ENTRIES_REQUEST,
				])
			}, 
			storageCodec, 
			this.grid,         
		);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};
		const storage = new HamokRemoteMap<K, V>(
			connection,
			options.remoteMap,
			options.equalValues,
		);

		storage.emitEvents = options.noEvents ?? true;

		connection.once('close', () => {
			connection.off('message', messageListener);
			this.maps.delete(storage.id);
		});
		connection.on('message', messageListener);
		
		this.remoteMaps.set(storage.id, storage);

		return storage;
	}

	public getOrCreateRemoteMap(options: HamokRemoteMapBuilderConfig<unknown, unknown>, callback?: (alreadyExisted: boolean) => void): HamokRemoteMap<unknown, unknown> {
		const existing = this.remoteMaps.get(options.mapId);

		try {
			if (existing) return existing;

			return this.createRemoteMap(options);
		} finally {
			callback?.(Boolean(existing));
		}
	}

	public createRecord<T extends HamokRecordObject>(options: HamokRecordBuilderConfig<T>): HamokRecord<T> {
		if (this.records.has(options.recordId)) {
			throw new Error(`Record with id ${options.recordId} already exists`);
		}

		const storageCodec = new StorageCodec<string, string>(
			createStrToUint8ArrayCodec(),
			createStrToUint8ArrayCodec(),
		);
		const connection = new HamokConnection<string, string>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.recordId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundMessageKeys ?? 0,
				maxOutboundValues: options.maxOutboundMessageValues ?? 0,
				maxMessageWaitingTimeInMs: options.maxMessageWaitingTimeInMs,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.UPDATE_ENTRIES_REQUEST,
				])
			}, 
			storageCodec, 
			this.grid,         
		);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};
		const record = new HamokRecord<T>(
			connection, {
				equalValues: options.equalValues,
				payloadsCodec: options.payloadCodecs,
				initalObject: options.initialObject,
			}
		);

		connection.once('close', () => {
			connection.off('message', messageListener);
			this.records.delete(record.id);
		});
		connection.on('message', messageListener);
		
		this.records.set(record.id, record);

		return record;
	}

	public getOrCreateRecord<T extends HamokRecordObject>(options: HamokRecordBuilderConfig<T>, callback?: (alreadyExisted: boolean) => void): HamokRecord<T> {
		const existing = this.records.get(options.recordId);

		try {
			if (existing) return existing;

			return this.createRecord(options);
		} finally {
			callback?.(Boolean(existing));
		}
	}

	public createQueue<T>(options: HamokQueueBuilderConfig<T>): HamokQueue<T> {
		if (this.queues.has(options.queueId)) {
			throw new Error(`Queue with id ${options.queueId} already exists`);
		}

		const storageCodec = new StorageCodec<number, T>(
			createNumberToUint8ArrayCodec(options.lengthOfBytesQueueKeys ?? 4),
			options.codec ?? createHamokJsonBinaryCodec<T>(),
		);
		const connection = new HamokConnection<number, T>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.queueId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundMessageKeys ?? 0,
				maxOutboundValues: options.maxOutboundMessageValues ?? 0,
				maxMessageWaitingTimeInMs: options.maxMessageWaitingTimeInMs,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
				])
			}, 
			storageCodec, 
			this.grid,         
		);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};
		const queue = new HamokQueue<T>(
			connection,
			options.baseMap ?? new MemoryBaseMap<number, T>(),
		);

		connection.once('close', () => {
			connection.off('message', messageListener);
			this.queues.delete(queue.id);
		});
		connection.on('message', messageListener);
		this.queues.set(queue.id, queue);

		return queue;
	}

	public getOrCreateQueue<T>(options: HamokQueueBuilderConfig<T>, callback?: (alreadyExisted: boolean) => void): HamokQueue<T> {
		const existing = this.queues.get(options.queueId);

		try {
			if (existing) return existing;

			return this.createQueue(options);
		} finally {
			callback?.(Boolean(existing));
		}
	}

	public createEmitter<T extends HamokEmitterEventMap>(options: HamokEmitterBuilderConfig<T>): HamokEmitter<T> {
		if (this.emitters.has(options.emitterId)) {
			throw new Error(`Emitter with id ${options.emitterId} already exists`);
		}

		const storageCodec = new StorageCodec<string, string>(
			createStrToUint8ArrayCodec(),
			createStrToUint8ArrayCodec(),
		);
		const connection = new HamokConnection<string, string>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.emitterId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundMessageKeys ?? 0,
				maxOutboundValues: options.maxOutboundMessageValues ?? 0,
				maxMessageWaitingTimeInMs: options.maxMessageWaitingTimeInMs,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
				])
			}, 
			storageCodec, 
			this.grid,         
		);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};
		const emitter = new HamokEmitter<T>(
			connection,
			options.payloadsCodec
		);

		connection.once('close', () => {
			connection.off('message', messageListener);
			this.emitters.delete(emitter.id);
		});
		connection.on('message', messageListener);
		this.emitters.set(emitter.id, emitter);

		return emitter;
	}

	public async submit(entry: HamokMessage): Promise<void> {
		if (!this.raft.leaderId) {
			throw new Error(`No leader is elected, cannot submit message type ${entry.type}`);
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

	public getOrCreateEmitter<T extends HamokEmitterEventMap>(options: HamokEmitterBuilderConfig<T>, callback?: (alreadyExisted: boolean) => void): HamokEmitter<T> {
		const existing = this.emitters.get(options.emitterId);

		try {
			if (existing) return existing;

			return this.createEmitter(options);
		} finally {
			callback?.(Boolean(existing));
		}
	}

	public accept(message: HamokMessage, commitIndex?: number): void {
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
				const storage = (
					this.records.get(message.storageId ?? '') ??
					this.maps.get(message.storageId ?? '') ??
					this.remoteMaps.get(message.storageId ?? '') ??
					this.queues.get(message.storageId ?? '') ??
					this.emitters.get(message.storageId ?? '')
				);

				if (!storage) {
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

	public async join(params?: HamokJoinProcessParams): Promise<void> {
		if (this._joining) return this._joining;
		try {
			this._joining = this._join({
				startAfterJoin: params?.startAfterJoin ?? true,
				fetchRemotePeerTimeoutInMs: params?.fetchRemotePeerTimeoutInMs ?? 5000,
				requestSnapshot: params?.requestSnapshot ?? true,
				maxRetry: params?.maxRetry ?? 3,
				removeRemotePeersOnNoHeartbeat: params?.removeRemotePeersOnNoHeartbeat ?? true,
			});

			await this._joining;
		} finally {
			this._joining = undefined;
		}
	}

	private async _join(params: Required<HamokJoinProcessParams>, retried = 0): Promise<void> {
		const {
			startAfterJoin,
			fetchRemotePeerTimeoutInMs,
			requestSnapshot,
			maxRetry,
			removeRemotePeersOnNoHeartbeat,
		} = params ?? {};

		logger.debug('Joining the network. startAfterJoin: %s, fetchRemotePeerTimeoutInMs: %s, requestSnapshot: %s, maxRetry: %s, removeRemotePeersOnNoHeartbeat: %s',
			startAfterJoin, fetchRemotePeerTimeoutInMs, requestSnapshot, maxRetry, removeRemotePeersOnNoHeartbeat
		);

		const { remotePeers, customResponses } = await this.fetchRemotePeers(
			fetchRemotePeerTimeoutInMs,
			requestSnapshot ? 'snapshot' : undefined
		);
		let bestSnapshot: HamokSnapshot | undefined;

		if (remotePeers.length < 1) {
			if (0 <= maxRetry && maxRetry <= retried) throw new Error('No remote peers found');

			logger.warn('No remote peers found, retrying %s/%s', retried, maxRetry < 0 ? '∞' : maxRetry);

			return this._join(params, retried + 1);
		}

		logger.debug('Remote peers found %o', remotePeers);

		if (requestSnapshot) {
			for (const serializedSnapshot of customResponses ?? []) {
				try {
					const snapshot = this._snapshotCodec.decode(serializedSnapshot);
	
					if (!bestSnapshot) bestSnapshot = snapshot;
	
					if (bestSnapshot.term < snapshot.term || bestSnapshot.commitIndex < snapshot.commitIndex) {
						bestSnapshot = snapshot;
					}
				} catch (err) {
					logger.error('Failed to parse snapshot %o', err);
				}
			}
		}

		logger.debug('Best snapshot %o', bestSnapshot);

		if (bestSnapshot) {
			try {
				this.import(bestSnapshot);
			} catch (err) {
				logger.error('Failed to import snapshot %o', err);
			}
		}

		if (removeRemotePeersOnNoHeartbeat) {
			const noHeartbeatListener = (remotePeerId: string) => this.removeRemotePeerId(remotePeerId);

			this.once('stopped', () => {
				this.off('no-heartbeat-from', noHeartbeatListener);
			});
			this.on('no-heartbeat-from', noHeartbeatListener);
		}

		const joinMsg = this._codec.encodeJoinNotification(new JoinNotification(this.localPeerId));

		// this will trigger the remote endpoint to add this endpoint
		this._emitMessage(joinMsg);

		if (startAfterJoin) {
			let leaderElected: () => void | undefined;
			let noMoreRemotePeers: () => void | undefined;
			
			return new Promise<void>((resolve, reject) => {
				leaderElected = () => (this.raft.leaderId !== undefined ? resolve() : void 0);
				noMoreRemotePeers = () => (this.remotePeerIds.size === 0 ? reject(new Error('No remote peers')) : void 0);

				this.on('leader-changed', leaderElected);
				this.on('remote-peer-left', noMoreRemotePeers);
				this.start();
				
			}).finally(() => {
				this.off('leader-changed', leaderElected);
				this.off('remote-peer-left', noMoreRemotePeers);
			});
		}
	}

	public async fetchRemotePeers(timeout?: number, customRequest?: HamokHelloNotificationCustomRequestType): Promise<HamokFetchRemotePeersResponse> {
		const helloMsg = this._codec.encodeHelloNotification(new HelloNotification(
			this.localPeerId, 
			this.raft.leaderId,
			customRequest
		));
		
		return new Promise((resolve) => {
			const remotePeerIds = new Set<string>();
			const customResponses: string[] = [];
			const timer = setTimeout(() => {
				for (const notification of this._remoteStateRequest?.responses ?? []) {
					notification.activeEndpointIds?.forEach((remotePeerId) => (remotePeerId !== this.localPeerId ? remotePeerIds.add(remotePeerId) : void 0));
					if (notification.sourceEndpointId !== this.localPeerId) {
						remotePeerIds.add(notification.sourceEndpointId);
					}

					if (notification.customData) {
						customResponses.push(notification.customData);
					}
				}

				this._remoteStateRequest = undefined;
				resolve({
					remotePeers: [ ...remotePeerIds ],
					customResponses: 0 < customResponses.length ? customResponses : undefined,
				});
			}, timeout ?? 5000);
	
			this._remoteStateRequest = {
				timer,
				responses: [],
			};

			this.emit('message', helloMsg);
		});
	}

	private _acceptGridMessage(message: HamokMessage): void {
		switch (message.type) {
			case HamokMessageType.HELLO_NOTIFICATION: {
				const hello = this._codec.decodeHelloNotification(message);
				let customResponse: string | undefined;

				switch (hello.customData as HamokHelloNotificationCustomRequestType) {
					case 'snapshot': {
						const snapshot = this.export();

						customResponse = this._snapshotCodec.encode(snapshot);
					}
				}

				const notification = this._codec.encodeEndpointStateNotification(new EndpointStatesNotification(
					this.localPeerId,
					hello.sourcePeerId,
					this.raft.props.currentTerm,
					this.raft.logs.commitIndex,
					this.leader ? this.raft.logs.nextIndex : -1,
					this.raft.logs.size,
					this.raft.remotePeers,
					customResponse
				));

				this.emit('message', notification);
				break;
			}
			case HamokMessageType.JOIN_NOTIFICATION: {
				const notification = this._codec.decodeJoinNotification(message);

				if (notification.sourcePeerId !== this.localPeerId) {
					this.addRemotePeerId(notification.sourcePeerId);	
				} else {
					logger.warn('%s Received join notification from itself %o', this.localPeerId, notification);
				}
				
				break;
			}
			case HamokMessageType.ENDPOINT_STATES_NOTIFICATION: {
				const endpointStateNotification = this._codec.decodeEndpointStateNotification(message);

				if (!this._remoteStateRequest) {
					return logger.trace('%s Received endpoint state notification without a pending request %o', this.localPeerId, endpointStateNotification);
				}
				this._remoteStateRequest.responses.push(endpointStateNotification);
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

	private _emitLeaderChanged(leaderId: string | undefined): void {
		for (const iterator of [ 
			this.records.values(),
			this.maps.values(), 
			this.queues.values(), 
			this.emitters.values(),
			this.remoteMaps.values(),
		]) {
			for (const collection of iterator) {
				collection.connection.emit('leader-changed', leaderId);
			}
		}
	}

	private _emitRemotePeerRemoved(remotePeerId: string): void {
		for (const iterator of [ 
			this.records.values(),
			this.maps.values(), 
			this.queues.values(), 
			this.emitters.values(),
		]) {
			for (const collection of iterator) {
				collection.connection.emit('remote-peer-removed', remotePeerId);
			}
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

		// if (message.protocol !== HamokMessageProtocol.RAFT_COMMUNICATION_PROTOCOL) 
		logger.trace('%s sending message %o', this.localPeerId, message);

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
