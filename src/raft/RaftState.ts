export type RaftStateName = 'follower' | 'candidate' | 'leader' | 'empty';

export interface RaftState {
	stateName: RaftStateName;
	init?: () => void;
	run: () => void;
	close: () => void;
}
