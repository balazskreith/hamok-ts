import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { RaftEngine, RaftEngineConfig } from './raft/RaftEngine';
import { HamokMessage, HamokMessage_MessageType as HamokMessageType, HamokMessage_MessageProtocol as HamokMessageProtocol } from './messages/HamokMessage';
import { RaftLogs } from './raft/RaftLogs';
import { createRaftFollowerState } from './raft/RaftFollowerState';
import { LogEntry } from './raft/LogEntry';
import { RaftStateName } from './raft/RaftState';
import { ReplicatedStorage } from './storages/ReplicatedStorage';
import { StorageConnection } from './storages/StorageConnection';
import { OngoingRequestsNotifier } from './OngoingRequestsNotifier';
import { createHamokJsonBinaryCodec, HamokCodec } from './common/HamokCodec';
import { StorageCodec } from './messages/StorageCodec';
import { BaseMap, MemoryBaseMap } from './storages/BaseMap';
import { createLogger } from './common/logger';
import { HamokGridCodec } from './messages/HamokGridCodec';
import { SubmitMessageRequest } from './messages/messagetypes/SubmitMessage';
import { HamokGrid } from './HamokGrid';

const logger = createLogger('Hamok');

export type HamokConfig = {
	// empty
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

export type HamokEventMap = {
	started: [],
	stopped: [],
	message: [message: HamokMessage]
	'remote-peer-joined': [peerId: string],
	'remote-peer-left': [peerId: string],
	'leader-changed': [leaderId: string | undefined],
	'state-changed': [state: RaftStateName],
	commit: [message: HamokMessage],
	'unresolvable-commit-gap': [{
		localPeerCommitIndex: number,
		leaderLowestCommitIndex: number,
	}],
}

export class Hamok extends EventEmitter<HamokEventMap> {

	public readonly config: HamokConfig;
	public readonly raft: RaftEngine;
	private _timer?: ReturnType<typeof setInterval>;
	private readonly _codec = new HamokGridCodec();
	public readonly grid: HamokGrid;
    
	public constructor(providedConfig?: Partial<HamokConstructorConfig>) {
		super();
		this.raft = new RaftEngine({
			peerId: providedConfig?.peerId ?? uuid(),
			electionTimeoutInMs: providedConfig?.electionTimeoutInMs ?? 3000,
			followerMaxIdleInMs: providedConfig?.followerMaxIdleInMs ?? 1000,
			heartbeatInMs: providedConfig?.heartbeatInMs ?? 100,
		}, new RaftLogs(
			providedConfig?.initialLogEntries ?? new Map(), 
			providedConfig?.logEntriesExpirationTimeInMs ?? 0
		), this);

		this.config = {
		};

		this.grid = new HamokGrid(
			this._emitMessage.bind(this),
			this.submit.bind(this),
			new OngoingRequestsNotifier(
				providedConfig?.ongoingRequestsSendingPeriodInMs ?? 1000,
				(msg) => this.emit('message', this._codec.encodeOngoingRequestsNotification(msg))
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

	public start(): void {
		if (this._timer) {
			return;
		}
		const raftEngine = this.raft;

		raftEngine.transport.on('message', this._emitMessage.bind(this));
		this.on('commit', this._acceptCommit.bind(this));

		raftEngine.state = createRaftFollowerState({
			raftEngine,
		});
		this._timer = setInterval(() => {
			raftEngine.state?.run();
		}, raftEngine.config.heartbeatInMs);

		this.emit('started');
	}
    
	public stop() {
		if (!this._timer) {
			return;
		}
		clearInterval(this._timer);
		
		this.raft.transport.off('message', this._emitMessage.bind(this));
		this.off('commit', this._acceptCommit.bind(this));
		this.emit('stopped');
	}

	private _acceptCommit(message: HamokMessage): void {
		logger.debug('%s accepted committed message %o', this.localPeerId, message);
		this.accept(message);
	}

	public addRemotePeerId(remoteEndpointId: string): void {
		this.raft.remotePeers.add(remoteEndpointId);

		logger.info('%s added remote peer %s', this.localPeerId, remoteEndpointId);

		this.emit('remote-peer-joined', remoteEndpointId);
	}

	public removeRemotePeerId(remoteEndpointId: string): void {
		this.raft.remotePeers.delete(remoteEndpointId);

		logger.info('%s removed remote peer %s', this.localPeerId, remoteEndpointId);

		this.emit('remote-peer-left', remoteEndpointId);
	}

	// public createPubSub(): PubSubComlinkBuilder {
	// 	return new PubSubComlinkBuilder()
	// 		.setHamokGrid(this);
	// }

	// public createSegmentedStorage<K, V>(baseStorage?: Storage<K, V>): SegmentedStorageBuilder<K, V> {
	// 	return SegmentedStorage.builder<K, V>()
	// 		.setBaseStorage(baseStorage)
	// 		.setHamokGrid(this);
	// }

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private readonly _replicatedStorages = new Map<string, ReplicatedStorage<any, any>>();

	public createReplicatedStorage<K, V>(options: {

		/**
         * The identifer of the storage
         */
		storageId: string,
		requestTimeoutInMs?: number,
		keyCodec?: HamokCodec<K, Uint8Array>,
		valueCodec?: HamokCodec<V, Uint8Array>,
		maxOutboundMessageKeys?: number,
		maxOutboundMessageValues?: number,
		baseMap?: BaseMap<K, V>,
		equalKeys?: (a: K, b: K) => boolean,
		equalValues?: (a: V, b: V) => boolean,
	}): ReplicatedStorage<K, V> {
		const storageCodec = new StorageCodec<K, V>(
			options.keyCodec ?? createHamokJsonBinaryCodec<K>(),
			options.valueCodec ?? createHamokJsonBinaryCodec<V>(),
		);
		const connection = new StorageConnection<K, V>(
			{
				requestTimeoutInMs: options.requestTimeoutInMs ?? 5000,
				storageId: options.storageId,
				neededResponse: 0,
				maxOutboundKeys: options.maxOutboundMessageKeys ?? 0,
				maxOutboundValues: options.maxOutboundMessageValues ?? 0,
				submitting: new Set([
					HamokMessageType.CLEAR_ENTRIES_REQUEST,
					HamokMessageType.INSERT_ENTRIES_REQUEST,
					HamokMessageType.DELETE_ENTRIES_REQUEST,
					HamokMessageType.REMOVE_ENTRIES_REQUEST,
				])
			}, 
			storageCodec, 
			this.grid,         
		);
		const equalKeys = options.equalKeys ?? ((a, b) => a === b);
		const equalValues = options.equalValues ?? ((a, b) => a === b);
		const messageListener = (message: HamokMessage, submitting: boolean) => {
			if (submitting) return this.submit(message);
			else this.emit('message', message);
		};
		const storage = new ReplicatedStorage<K, V>(
			connection,
			options.baseMap ?? new MemoryBaseMap<K, V>(),
			equalValues,
			equalKeys,
		);

		connection.once('close', () => {
			connection.off('message', messageListener);
			this._replicatedStorages.delete(storage.id);
		});
		connection.on('message', messageListener);
		this._replicatedStorages.set(storage.id, storage);

		return storage;
	}

	public async submit(entry: HamokMessage): Promise<void> {
		if (!this.raft.leaderId) {
			throw new Error(`No leader is elected, cannot submit message type ${entry.type}`);
		}
		
		entry.sourceId = this.localPeerId;

		if (this.leader) {
			return (this.raft.submit(entry), void 0);
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
			logger.info('Leader changed from %s to %s, submit will be resend to the new leader', this.raft.leaderId, response.leaderId);
			
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
					this._replicatedStorages.get(message.storageId ?? '')
				);

				if (!storage) {
					return logger.warn('Received message for unknown storage %s', message.storageId);
				}
				
				return storage.connection.accept(message);
			}
			// case HamokMessageProtocol.PUBSUB_COMMUNICATION_PROTOCOL:
			// 	this._dispatchToPubSub(message);
			default:
				return logger.warn('Unknown protocol %s, message: %o', message.protocol, message);
		}
	}

	private _acceptGridMessage(message: HamokMessage): void {
		switch (message.type) {
			case HamokMessageType.ONGOING_REQUESTS_NOTIFICATION: {
				const ongoingRequestNotification = this._codec.decodeOngoingRequestsNotification(message);

				for (const requestId of ongoingRequestNotification.requestIds) {
					this.grid.pendingRequests.get(requestId)?.postponeTimeout();
				}
				break;
			}
			case HamokMessageType.SUBMIT_MESSAGE_REQUEST: {
				const request = this._codec.decodeSubmitMessageRequest(message);
				const success = this.leader ? this.raft.submit(request.entry) : false;
				const response = request.createResponse(success, this.raft.leaderId);

				this.grid.sendMessage(
					this._codec.encodeSubmitMessageResponse(response),
					message.sourceId
				);
				break;
			}
		}
	}

	private _emitMessage(
		message: HamokMessage, 
		destinationPeerIds?: ReadonlySet<string> | string[] | string,
	) {
		message.sourceId = this.localPeerId;

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