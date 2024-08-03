import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { RaftEngine, RaftEngineConfig } from './raft/RaftEngine';
import { HamokMessage, HamokMessage_MessageType as HamokMessageType, HamokMessage_MessageProtocol as HamokMessageProtocol } from './messages/HamokMessage';
import { MemoryStoredRaftLogs } from './raft/MemoryStoredRaftLogs';
import { createRaftFollowerState } from './raft/RaftFollowerState';
import { LogEntry } from './raft/LogEntry';
import { RaftStateName } from './raft/RaftState';
import { HamokStorage } from './collections/HamokStorage';
import { HamokConnection } from './collections/HamokConnection';
import { OngoingRequestsNotifier } from './messages/OngoingRequestsNotifier';
import { createHamokJsonBinaryCodec, createNumberToUint8ArrayCodec, createStrToUint8ArrayCodec, HamokCodec } from './common/HamokCodec';
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

const logger = createLogger('Hamok');

export type HamokConfig = {
	// empty
	raftLogs?: RaftLogs,
}

export type HamokConstructorConfig = RaftEngineConfig & HamokConfig & {
	logEntriesExpirationTimeInMs?: number,
	initialLogEntries?: Map<number, LogEntry>,

	/**
     * In case a requestId is added explicitly to the ongoing requests set
     * by calling the addOngoingRequestId() this setting determines the period 
     * to send notification to the source(s) about an ongoing requests to prevent timeout there
     * The notification stopped sent if removeOngoingRequestId is called, and it is very important 
     * to call it explicitly in any case. In another word comlink is not responsible to handle 
     * automatically an explicitly postponed request to stop sending notification about.
     */
	ongoingRequestsSendingPeriodInMs: number;
}

export type HamokStorageBuilderConfig<K, V> = {
	storageId: string,
	requestTimeoutInMs?: number,
	maxMessageWaitingTimeInMs?: number,
	keyCodec?: HamokCodec<K, Uint8Array>,
	valueCodec?: HamokCodec<V, Uint8Array>,
	maxOutboundMessageKeys?: number,
	maxOutboundMessageValues?: number,
	baseMap?: BaseMap<K, V>,
	equalKeys?: (a: K, b: K) => boolean,
	equalValues?: (a: V, b: V) => boolean,
}

export type HamokQueueBuilderConfig<T> = {
	queueId: string,
	codec?: HamokCodec<T, Uint8Array>,
	requestTimeoutInMs?: number,
	maxMessageWaitingTimeInMs?: number,
	maxOutboundMessageKeys?: number,
	maxOutboundMessageValues?: number,
	baseMap?: BaseMap<number, T>,
	lengthOfBytesQueueKeys?: 2 | 4 | 8,
}

export type HamokEmitterBuilderConfig<T extends HamokEmitterEventMap> = {
	emitterId: string,
	requestTimeoutInMs?: number,
	maxMessageWaitingTimeInMs?: number,
	maxOutboundMessageKeys?: number,
	maxOutboundMessageValues?: number,
	payloadsCodec?: Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>,
}

export type HamokEventMap = {
	started: [],
	stopped: [],
	follower: [],
	leader: [],
	message: [message: HamokMessage]
	'remote-peer-joined': [peerId: string],
	'remote-peer-left': [peerId: string],
	'leader-changed': [leaderId: string | undefined, prevLeader: string | undefined],
	'state-changed': [state: RaftStateName],
	commit: [commitIndex: number, message: HamokMessage],
	heartbeat: [],
}

export class Hamok extends EventEmitter<HamokEventMap> {
	public readonly config: HamokConfig;
	public readonly raft: RaftEngine;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly storages = new Map<string, HamokStorage<any, any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly queues = new Map<string, HamokQueue<any>>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly emitters = new Map<string, HamokEmitter<any>>();

	private _timer?: ReturnType<typeof setInterval>;
	private readonly _codec = new HamokGridCodec();
	public readonly grid: HamokGrid;

	public constructor(providedConfig?: Partial<HamokConstructorConfig>) {
		super();
		const raftLogs = providedConfig?.raftLogs ?? new MemoryStoredRaftLogs({
			expirationTimeInMs: 0,
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
		};

		this.grid = new HamokGrid(
			this._emitMessage.bind(this),
			this.submit.bind(this),
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
		return Boolean(this._timer); 
	}

	public start(): void {
		if (this._timer) {
			return;
		}
		const raftEngine = this.raft;

		raftEngine.transport.on('message', this._emitMessage.bind(this));
		this.on('leader-changed', this._emitLeaderChanged.bind(this));
		this.on('commit', this._acceptCommit.bind(this));

		raftEngine.state = createRaftFollowerState({
			raftEngine,
		});
		this._timer = setInterval(() => {
			raftEngine.state.run();
			
			this.emit('heartbeat');
		}, raftEngine.config.heartbeatInMs);

		this.emit('started');
	}
    
	public stop() {
		if (!this._timer) {
			return;
		}
		const raftEngine = this.raft;

		clearInterval(this._timer);
		this._timer = undefined;

		raftEngine.state = createRaftEmptyState({
			raftEngine,
		});
		
		raftEngine.transport.off('message', this._emitMessage.bind(this));
		this.off('commit', this._acceptCommit.bind(this));
		this.off('leader-changed', this._emitLeaderChanged.bind(this));

		this.emit('stopped');
	}

	private _acceptCommit(commitIndex: number, message: HamokMessage): void {
		logger.debug('%s accepted committed message %o', this.localPeerId, message);
		
		// if we put this request to hold when we accepted the submit request we remove the ongoing request notification
		// so from this moment it is up to the storage / pubsub to accomplish the request
		if (message.requestId && this.grid.ongoingRequestsNotifier.has(message.requestId)) {
			this.grid.ongoingRequestsNotifier.remove(message.requestId);

			logger.trace('%s Request %s is removed ongoing requests', this.localPeerId, message.requestId);
		}
		this.accept(message);
	}

	public addRemotePeerId(remoteEndpointId: string): void {
		this.raft.remotePeers.add(remoteEndpointId);

		logger.debug('%s added remote peer %s', this.localPeerId, remoteEndpointId);

		this.emit('remote-peer-joined', remoteEndpointId);
	}

	public removeRemotePeerId(remoteEndpointId: string): void {
		this.raft.remotePeers.delete(remoteEndpointId);

		logger.debug('%s removed remote peer %s', this.localPeerId, remoteEndpointId);

		this.emit('remote-peer-left', remoteEndpointId);
	}

	public export(): HamokSnapshot {
		const result: HamokSnapshot = {
			meta: {
				created: Date.now(),
				peerId: this.localPeerId,
			},
			commitIndex: this.raft.logs.commitIndex,
			term: this.raft.props.currentTerm,
			storages: [ ...this.storages.values() ].map((storage) => storage.export()),
			queues: [ ...this.queues.values() ].map((queue) => queue.export()),
			emitters: [ ...this.emitters.values() ].map((emitter) => emitter.export()),
		};

		for (const storage of this.storages.values()) {
			result.storages.push(storage.export());
		}

		return result;
	}

	public import(snapshot: HamokSnapshot) {
		if (this._timer) {
			throw new Error('Cannot import snapshot while running');
		}

		for (const storageSnapshot of snapshot.storages) {
			const storage = this.storages.get(storageSnapshot.storageId);

			if (!storage) {
				logger.warn('Cannot import storage snapshot, becasuee storage %s is not found. snapshot: %o', storageSnapshot.storageId, storageSnapshot);
				continue;
			}

			storage.import(storageSnapshot);
		}

		for (const queueSnapshot of snapshot.queues) {
			const queue = this.queues.get(queueSnapshot.queueId);

			if (!queue) {
				logger.warn('Cannot import queue snapshot, becasuee queue %s is not found. snapshot: %o', queueSnapshot.queueId, queueSnapshot);
				continue;
			}

			queue.import(queueSnapshot);
		}

		for (const emitterSnapshot of snapshot.emitters) {
			const emitter = this.emitters.get(emitterSnapshot.emitterId);

			if (!emitter) {
				logger.warn('Cannot import emitter snapshot, becasuee emitter %s is not found. snapshot: %o', emitterSnapshot.emitterId, emitterSnapshot);
				continue;
			}

			emitter.import(emitterSnapshot);
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

	public createStorage<K, V>(options: HamokStorageBuilderConfig<K, V>): HamokStorage<K, V> {
		if (this.storages.has(options.storageId)) {
			throw new Error(`Storage with id ${options.storageId} already exists`);
		}

		const storageCodec = new StorageCodec<K, V>(
			options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
			options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
		);
		const connection = new HamokConnection<K, V>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.storageId,
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
		const storage = new HamokStorage<K, V>(
			connection,
			options.baseMap ?? new MemoryBaseMap<K, V>(),
			options.equalValues,
			options.equalKeys,
		);

		connection.once('close', () => {
			connection.off('message', messageListener);
			this.storages.delete(storage.id);
		});
		connection.on('message', messageListener);
		
		this.storages.set(storage.id, storage);

		return storage;
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

	public accept(message: HamokMessage) {
		if (message.destinationId && message.destinationId !== this.localPeerId) {
			return logger.trace('%s Received message address is not matching with the local peer %o', this.localPeerId, message);
		}

		if (message.protocol !== HamokMessageProtocol.RAFT_COMMUNICATION_PROTOCOL) 
			logger.debug('%s received message %o', this.localPeerId, message);

		switch (message.type) {
			case HamokMessageType.ADD_SUBSCRIPTION_RESPONSE:
			case HamokMessageType.REMOVE_SUBSCRIPTION_RESPONSE:
			case HamokMessageType.GET_ENTRIES_RESPONSE:
			case HamokMessageType.GET_KEYS_RESPONSE:
			case HamokMessageType.GET_SIZE_RESPONSE:
			case HamokMessageType.CLEAR_ENTRIES_RESPONSE:
			case HamokMessageType.DELETE_ENTRIES_RESPONSE:
			case HamokMessageType.REMOVE_ENTRIES_RESPONSE:
			case HamokMessageType.EVICT_ENTRIES_RESPONSE:
			case HamokMessageType.INSERT_ENTRIES_RESPONSE:
			case HamokMessageType.UPDATE_ENTRIES_RESPONSE:
			case HamokMessageType.RESTORE_ENTRIES_RESPONSE:
			case HamokMessageType.SUBMIT_MESSAGE_RESPONSE:
				// raft relatd messages are different animal
				// case HamokMessageType.RAFT_APPEND_ENTRIES_RESPONSE
				// case HamokMessageType.
				return this.grid.processResponse(message);
		}

		switch (message.protocol) {
			case HamokMessageProtocol.RAFT_COMMUNICATION_PROTOCOL:
				this.raft.transport.receive(message);
				break;
			// case undefined:
			case HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL:
				this._acceptGridMessage(message);
				break;
			case HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL: {
				const storage = (
					this.storages.get(message.storageId ?? '') ??
					this.queues.get(message.storageId ?? '') ??
					this.emitters.get(message.storageId ?? '')
				);

				if (!storage) {
					return logger.trace('Received message for unknown collection %s', message.storageId);
				}
				
				return storage.connection.accept(message);
			}
			// case HamokMessageProtocol.PUBSUB_COMMUNICATION_PROTOCOL:
			// 	this._dispatchToPubSub(message);
			default:
				return logger.warn('%s Unknown protocol %s, message: %o', this.localPeerId, message.protocol, message);
		}
	}

	private _acceptGridMessage(message: HamokMessage): void {
		switch (message.type) {
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
			this.storages.values(), 
			this.queues.values(), 
			this.emitters.values(),
		]) {
			for (const collection of iterator) {
				collection.connection.emit('leader-changed', leaderId);
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

		if (message.protocol !== HamokMessageProtocol.RAFT_COMMUNICATION_PROTOCOL) 
			logger.debug('%s sending message %o', this.localPeerId, message);

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
}