import { createLogger } from '../common/logger';
import { RaftAppendEntriesRequestChunk, RaftAppendEntriesResponse } from '../messages/messagetypes/RaftAppendEntries';
import { RaftVoteRequest, RaftVoteResponse } from '../messages/messagetypes/RaftVote';
import { RaftEngine } from './RaftEngine';
import { RaftState } from './RaftState';

const logger = createLogger('RaftEmptyState');

export type RaftCandidateStateContext = {
	raftEngine: RaftEngine;
};

export function createRaftEmptyState(context: RaftCandidateStateContext): RaftState {
	logger.trace('Creating RaftEmptyState');
	
	const {
		raftEngine
	} = context;
	const messageEmitter = raftEngine.transport;
	let closed = false;
	const appendEntriesRequestListener = (request: RaftAppendEntriesRequestChunk) => {
		logger.trace('%s received an append entries request from %s, but it is in an empty state. request: %o', raftEngine.localPeerId, request.leaderId, request);
	};
	const appendEntriesResponseListener = (response: RaftAppendEntriesResponse) => {
		logger.warn('%s received an append entries response from %s, but it is in an empty state. response: %o', raftEngine.localPeerId, response.sourcePeerId, response);
	};
	const voteRequestListener = (request: RaftVoteRequest) => {
		logger.warn('%s received a vote request from %s, but it is in an empty state. request: %o', raftEngine.localPeerId, request.candidateId, request);
	};
	const voteResponseListener = (response: RaftVoteResponse) => {
		logger.warn('%s received a vote response from %s, but it is in an empty state. response: %o', raftEngine.localPeerId, response.sourcePeerId, response);
	};
	const close = () => {
		if (closed) return;
		closed = true;
		messageEmitter.off('RaftVoteRequest', voteRequestListener);		
		messageEmitter.off('RaftVoteResponse', voteResponseListener);
		messageEmitter.off('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);
		messageEmitter.off('RaftAppendEntriesResponse', appendEntriesResponseListener);

		logger.debug('%s closed', raftEngine.localPeerId);
	};

	messageEmitter.on('RaftVoteRequest', voteRequestListener);
	messageEmitter.on('RaftVoteResponse', voteResponseListener);
	messageEmitter.on('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);
	messageEmitter.on('RaftAppendEntriesResponse', appendEntriesResponseListener);

	const run = () => {
		
	};

	return {
		stateName: 'empty' as const,
		run,
		close,
	};
}
