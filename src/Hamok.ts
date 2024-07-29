import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { RaftEngine, RaftEngineConfig } from './raft/RaftEngine';
import { logger, LogLevel } from './common/logger';
import { HamokMessage, HamokMessage_MessageProtocol as MessageProtocol } from './messages/HamokMessage';
import { RaftLogs } from './raft/RaftLogs';
import { createRaftFollowerState } from './raft/RaftFollowerState';
import { LogEntry } from './raft/LogEntry';
import { RaftStateName } from './raft/RaftState';

export type HamokConfig = {
	// empty
}

export type HamokConstructorConfig = RaftEngineConfig & HamokConfig & {
	logLevel?: LogLevel,
	logEntriesExpirationTimeInMs?: number,
	initialLogEntries?: Map<number, LogEntry>,

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
    
	public constructor(providedConfig: Partial<HamokConstructorConfig>) {
		super();
		this.raft = new RaftEngine({
			peerId: providedConfig.peerId ?? uuid(),
			electionTimeoutInMs: providedConfig.electionTimeoutInMs ?? 3000,
			followerMaxIdleInMs: providedConfig.followerMaxIdleInMs ?? 1000,
			heartbeatInMs: providedConfig.heartbeatInMs ?? 100,
			peerMaxIdleTimeInMs: providedConfig.peerMaxIdleTimeInMs ?? 1000,
			sendingHelloTimeoutInMs: providedConfig.sendingHelloTimeoutInMs ?? 1000
		}, new RaftLogs(
			providedConfig.initialLogEntries ?? new Map(), 
			providedConfig.logEntriesExpirationTimeInMs ?? 0
		), this);

		this.config = {
			logLevel: providedConfig.logLevel ?? 'silent',
		};

		logger.level = providedConfig.logLevel ?? 'silent';
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
		this.emit('stopped');
	}

	public addRemotePeerId(remoteEndpointId: string): void {
		this.raft.remotePeers.add(remoteEndpointId);

		this.emit('remote-peer-joined', remoteEndpointId);
	}

	public removeRemotePeerId(remoteEndpointId: string): void {
		this.raft.remotePeers.delete(remoteEndpointId);

		this.emit('remote-peer-left', remoteEndpointId);
	}

	public createPubSub(): PubSubComlinkBuilder {
		return new PubSubComlinkBuilder()
			.setHamokGrid(this);
	}

	public createSegmentedStorage<K, V>(baseStorage?: Storage<K, V>): SegmentedStorageBuilder<K, V> {
		return SegmentedStorage.builder<K, V>()
			.setBaseStorage(baseStorage)
			.setHamokGrid(this);
	}

	public createReplicatedStorage<K, V>(baseStorage?: Storage<K, V>): ReplicatedStorageBuilder<K, V> {
		return ReplicatedStorage.builder<K, V>()
			.setBaseStorage(baseStorage)
			.setHamokGrid(this);
	}

	private _emitMessage(message: HamokMessage): void {
		message.sourceId = this.raft.localPeerId;
		
		logger.trace('Sending message %o', message);
		
		this.emit('message', message);
	}

	public accept(message: HamokMessage) {
		
		logger.trace('Received message %o', message);
		
		switch (message.protocol) {
			case MessageProtocol.RAFT_COMMUNICATION_PROTOCOL:
				this.raft.transport.receive(message);
				break;
			// case undefined:
			// case MessageProtocol.GRID_COMMUNICATION_PROTOCOL:
			// 	this._dispatcher.receive(message);
			// 	break;
			case MessageProtocol.STORAGE_COMMUNICATION_PROTOCOL:
				this._dispatchToStorage(message);
				break;
			case MessageProtocol.PUBSUB_COMMUNICATION_PROTOCOL:
				this._dispatchToPubSub(message);
			default:
				return logger.warn('Unknown protocol', message.protocol);
		}
	}
}