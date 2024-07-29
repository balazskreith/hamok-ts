export type RaftStateName = 'follower' | 'candidate' | 'leader' | 'empty';

export interface RaftState {
	stateName: RaftStateName;
	run: () => void;
	close: () => void;
}
