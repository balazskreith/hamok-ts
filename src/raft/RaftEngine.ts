import { EventEmitter } from 'events';
import { RaftMessageEmitter } from '../messages/RaftMessageEmitter';
import { SyncedProperties } from './SyncedProperties';
import { RaftLogs } from './RaftLogs';
import { createRaftEmptyState } from './RaftEmptyState';
import { createLogger } from '../common/logger';
import { HamokMessage } from '../messages/HamokMessage';
import { RaftState } from './RaftState';
import type { HamokEventMap } from '../Hamok';

const logger = createLogger('RaftEngine');

export type RaftEngineConfig = {
	peerId: string,
	electionTimeoutInMs: number;
	followerMaxIdleInMs: number,
	heartbeatInMs: number,
}

export class RaftEngine {
	private _state: RaftState;
    
	public readonly props = new SyncedProperties();
	private _leaderId?: string;
	public readonly remotePeers = new Set<string>();
	public readonly transport = new RaftMessageEmitter();

	public constructor(
		public readonly config: RaftEngineConfig,
		public readonly logs: RaftLogs,
		public readonly events: EventEmitter<HamokEventMap>
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

	public set leaderId(newLeaderId: string | undefined) {
		if (this._leaderId === newLeaderId) return;
		const prevLeaderId = this._leaderId;

		this._leaderId = newLeaderId;

		logger.info(`%s Leader changed from ${prevLeaderId} to ${newLeaderId}`, this.localPeerId);
		
		this.events.emit('leader-changed', newLeaderId);
	}

	public get state(): RaftState {
		return this._state;
	}

	public set state(newState: RaftState) {
		if (this._state.stateName === newState.stateName) return;
		const prevState = this._state;

		prevState.close();
		this._state = newState;
		
		logger.info(`%s State changed from ${prevState.stateName} to ${newState.stateName}`, this.localPeerId);
		
		newState.init?.();

		this.events.emit('state-changed', newState.stateName);
	}

	public submit(message: HamokMessage): boolean {
		if (this._state.stateName !== 'leader') {
			return false;
		}

		this.logs.submit(this.props.currentTerm, message);
		
		return true;
	}
}