import { EventEmitter } from 'events';
import { RaftMessageEmitter } from '../messages/RaftMessageEmitter';
import { SyncedProperties } from './SyncedProperties';
import { createRaftEmptyState } from './RaftEmptyState';
import { createLogger } from '../common/logger';
import { HamokMessage } from '../messages/HamokMessage';
import { RaftState } from './RaftState';
import type { HamokEventMap } from '../Hamok';
import { RaftLogs } from './RaftLogs';

const logger = createLogger('RaftEngine');

/**
 * Configuration settings for the Raft engine.
 */
export type RaftEngineConfig = {

	/**
	 * The unique identifier for the peer in the Raft cluster.
	 */
	peerId: string,

	/**
	 * The timeout duration in milliseconds for elections.
	 * If an election has not been completed within this duration, a  candidate change state to follower.
	 */
	electionTimeoutInMs: number,

	/**
	 * The maximum idle time in milliseconds for a follower.
	 * If the follower is idle for longer than this duration, it considers the leader to be unavailable and starts an election.
	 */
	followerMaxIdleInMs: number,

	/**
	 * The interval in milliseconds at which heartbeats are sent by the leader to maintain authority over followers,
	 * and sending the logs.
	 */
	heartbeatInMs: number,

	/**
	 * If true, this peer will only be a follower and will never become a candidate or leader.
	 */
	onlyFollower: boolean,
}

interface HamokController extends EventEmitter {
	on<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	once<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	off<U extends keyof HamokEventMap>(event: U, listener: (...args: HamokEventMap[U]) => void): this;
	emit<U extends keyof HamokEventMap>(event: U, ...args: HamokEventMap[U]): boolean;
	// stop(): void;
}

export class RaftEngine {
	private _state: RaftState;
    
	public readonly props = new SyncedProperties();
	private _leaderId?: string;
	public readonly remotePeers = new Set<string>();
	public readonly transport = new RaftMessageEmitter();
	private _failedElections = 0;

	public constructor(
		public readonly config: RaftEngineConfig,
		public readonly logs: RaftLogs,
		public readonly events: HamokController
	) {
		if (this.config.heartbeatInMs < 1) throw new Error('Config error: heartbeatInMs must be greater than 0');
		this._state = createRaftEmptyState({
			raftEngine: this,
		});
	}
        
	public get localPeerId(): string {
		return this.config.peerId;
	}

	public get leaderId(): string | undefined {
		return this._leaderId;
	}

	public get failedElections(): number {
		return this._failedElections;
	}

	public set leaderId(newLeaderId: string | undefined) {
		if (this._leaderId === newLeaderId) return;
		const prevLeaderId = this._leaderId;

		this._leaderId = newLeaderId;

		logger.info(`%s Leader changed from ${prevLeaderId} to ${newLeaderId}`, this.localPeerId);
		
		if (newLeaderId !== undefined) {
			this._failedElections = 0;
		}

		this.events.emit('leader-changed', newLeaderId, prevLeaderId);
	}

	public get state(): RaftState {
		return this._state;
	}

	public set state(newState: RaftState) {
		if (this._state.stateName === newState.stateName) return;
		const prevState = this._state;

		prevState.close();
		this._state = newState;

		logger.debug(`%s State changed from ${prevState.stateName} to ${newState.stateName}`, this.localPeerId);
		
		if (prevState.stateName === 'candidate' && newState.stateName === 'follower') {
			++this._failedElections;
		}

		newState.init?.();

		this.events.emit('state-changed', newState.stateName, prevState.stateName);

		switch (newState.stateName) {
			case 'leader':
			case 'follower':
			case 'candidate':
				this.events.emit(newState.stateName);
				break;
		}
	}

	public submit(message: HamokMessage): boolean {
		if (this._state.stateName !== 'leader') {
			return false;
		}

		this.logs.submit(this.props.currentTerm, message);
		
		return true;
	}
}