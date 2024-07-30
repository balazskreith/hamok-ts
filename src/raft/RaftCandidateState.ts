import { createLogger } from '../common/logger';
import { RaftAppendEntriesRequestChunk, RaftAppendEntriesResponse } from '../messages/messagetypes/RaftAppendEntries';
import { RaftVoteRequest, RaftVoteResponse } from '../messages/messagetypes/RaftVote';
import { RaftEngine } from './RaftEngine';
import { RaftState } from './RaftState';
import { createRaftFollowerState } from './RaftFollowerState';
import { createRaftLeaderState } from './RaftLeaderState';

const logger = createLogger('RaftCandidateState');

export type RaftCandidateStateContext = {
	raftEngine: RaftEngine;
	electionTerm: number;
};

export function createRaftCandidateState(context: RaftCandidateStateContext): RaftState {
	logger.trace('Creating RaftCandidateState');

	const {
		raftEngine
	} = context;
	const config = raftEngine.config;
	const logs = raftEngine.logs;
	const messageEmitter = raftEngine.transport;
	const props = raftEngine.props;
	const localPeerId = raftEngine.localPeerId;
	const remotePeers = raftEngine.remotePeers;
	const respondedRemotePeerIds = new Set<string>();
	const receivedVotes = new Set<string>([
		localPeerId, // vote for itself
	]);
	const notifiedRemotePeers = new Set<string>();
	let closed = false;
	let started: number | undefined;
	const appendEntriesRequestListener = (request: RaftAppendEntriesRequestChunk) => {
		if (!remotePeers.has(request.peerId)) {
			logger.warn(`%s Received an append entries request from an unknown peer: ${request.peerId}`, localPeerId);
		}
		if (request.term < context.electionTerm) {
			return logger.debug('%s Received an append entries request from a peer with a smaller term than the current election term. Request: %o', localPeerId, request);
		}
		
		logger.debug('%s Received an append entries request from a peer with a higher term than the current election term. Request: %o', localPeerId, request);
		
		// a leader has been elected, let's go back to the follower state
		return follow();
	};
	const appendRaftEntriesResponseListener = (response: RaftAppendEntriesResponse) => {
		if (!remotePeers.has(response.sourcePeerId)) {
			return logger.warn(`%s Received an append entries response from an unknown peer: ${response.sourcePeerId}`, localPeerId);
		}
		
		return logger.debug('%s Received an append entries response from %s', localPeerId, response.sourcePeerId);
	};
	const voteRequestListener = (request: RaftVoteRequest) => {
		if (!remotePeers.has(request.candidateId)) {
			return logger.warn('%s Received a vote request from an unknown peer: %s. remotePeers: %s, request: %o', localPeerId, request.candidateId, Array.from(remotePeers).join(', '), request);
		}
		logger.debug('%s Received a vote request from %s', localPeerId, request.peerId);
	};
	const voteResponseListener = (response: RaftVoteResponse) => {
		if (!remotePeers.has(response.sourcePeerId)) {
			return logger.warn(`Received a vote response from an unknown peer: ${response.sourcePeerId}`);
		}

		if (context.electionTerm < response.term) {
			// election should dismiss, case should be closed
			logger.warn(`%s Candidate received response from a higher term (${response.term}) than the current election term (${context.electionTerm}).`, localPeerId);
			
			return follow();
		}
		if (response.term < context.electionTerm) {
			return logger.warn('A vote response from a term smaller than the current is received: %o', response);
		}
		respondedRemotePeerIds.add(response.sourcePeerId);
		if (!response.voteGranted) {
			return;
		}
		receivedVotes.add(response.sourcePeerId);

		const numberOfPeerIds = remotePeers.size + 1; // +1, because of a local peer!

		logger.debug('%s Received vote for leadership: %d, number of peers: %d.', localPeerId, receivedVotes.size, numberOfPeerIds);
		
		if (numberOfPeerIds < receivedVotes.size * 2) {
			// won the election
			return lead();
		}
	};

	const close = () => {
		if (closed) return;
		closed = true;
		messageEmitter.off('RaftVoteRequest', voteRequestListener);
		messageEmitter.off('RaftVoteResponse', voteResponseListener);		
		messageEmitter.off('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);
		messageEmitter.off('RaftAppendEntriesResponse', appendRaftEntriesResponseListener);

		logger.debug('%s Candidate state is closed', localPeerId);
	};

	messageEmitter.on('RaftVoteRequest', voteRequestListener);
	messageEmitter.on('RaftVoteResponse', voteResponseListener);
	messageEmitter.on('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);
	messageEmitter.on('RaftAppendEntriesResponse', appendRaftEntriesResponseListener);

	const run = () => {
		for (const remotePeerId of remotePeers) {
			if (notifiedRemotePeers.has(remotePeerId)) {
				continue;
			}
			const request = new RaftVoteRequest(
				context.electionTerm,
				logs.nextIndex - 1,
				props.currentTerm,
				remotePeerId,
				localPeerId,
			);

			logger.info('%s Send vote request to %s', localPeerId, request.peerId);
			messageEmitter.send(request);
			notifiedRemotePeers.add(remotePeerId);
		}

		if (!started) return (started = Date.now());

		const elapsedTimeInMs = Date.now() - started;
		
		if (config.electionTimeoutInMs < elapsedTimeInMs) {
			// election timeout

			logger.warn(`${localPeerId} Timeout occurred during the election process 
                (electionTimeoutInMs: ${config.electionTimeoutInMs}, 
                elapsedTimeInMs: ${elapsedTimeInMs}, 
                respondedRemotePeerIds: ${Array.from(respondedRemotePeerIds).join(', ')}). 
                This can be a result because of split vote. 
                elapsedTimeInMs: ${elapsedTimeInMs}`, 
			);
			
			return follow();
		}
	};
	const follow = () => {
		raftEngine.state = createRaftFollowerState({
			raftEngine,
			extraWaitingTime: Math.random() * 10000,
		});
	};
	const lead = () => {
		if (context.electionTerm <= props.currentTerm) {
			logger.warn('%s Candidate won the election, but the term has been changed. Current term: %d, Election term: %d', localPeerId, props.currentTerm, context.electionTerm);

			return follow();
		} else if (props.currentTerm + 1 < context.electionTerm) {
			logger.warn('%s Candidate won the election, but the term has been changed. Current term: %d, Election term: %d', localPeerId, props.currentTerm, context.electionTerm);

			return follow();
		}
		// won the election
		props.currentTerm = context.electionTerm;
		raftEngine.state = createRaftLeaderState({
			raftEngine,
		});
	};
	
	return {
		stateName: 'candidate' as const,
		run,
		close,
	};
}
