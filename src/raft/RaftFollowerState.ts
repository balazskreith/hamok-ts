import { createLogger } from '../common/logger';
import { RaftAppendEntriesRequestChunk } from '../messages/messagetypes/RaftAppendEntries';
import { RaftVoteRequest } from '../messages/messagetypes/RaftVote';
import { RaftAppendEntriesRequest } from './RaftAppendEntriesRequest';
import { createRaftCandidateState } from './RaftCandidateState';
import { RaftEngine } from './RaftEngine';

const logger = createLogger('RaftFollowerState');

export type RaftFollowerStateContext = {
	raftEngine: RaftEngine;
	extraWaitingTime?: number,
};

export type RaftFollowerState = ReturnType<typeof createRaftFollowerState>;

export function createRaftFollowerState(context: RaftFollowerStateContext) {
	const {
		raftEngine
	} = context;
	const config = raftEngine.config;
	const messageEmitter = raftEngine.transport;
	const props = raftEngine.props;
	const localPeerId = raftEngine.localPeerId;
	const logs = raftEngine.logs;
	const pendingRequests = new Map<string, RaftAppendEntriesRequest>();
	let updated = Date.now();
	let closed = false;
	let currentTerm = props.currentTerm;
	let syncRequested = false;
	const updateCommitIndex = (leaderCommitIndex: number) => {
		logger.trace('%s updateCommitIndex leaderCommitIndex: %d, logsCommitIndex: %d', localPeerId, leaderCommitIndex, logs.commitIndex);
		if (leaderCommitIndex <= logs.commitIndex) {
			return;
		}
		const expectedCommitIndex = Math.min(logs.nextIndex - 1, leaderCommitIndex);
		const committedLogEntries = logs.commitUntil(expectedCommitIndex);

		logger.trace('%s updateCommitIndex committedLogEntries: %d', localPeerId, committedLogEntries.length);

		for (const logEntry of committedLogEntries) {
			raftEngine.events.emit('commit', logEntry.entry);
		}
	};
	const appendEntriesRequestListener = (requestChunk: RaftAppendEntriesRequestChunk) => {
		logger.trace('%s received RaftAppendEntriesRequestChunk %o', localPeerId, requestChunk);

		if (requestChunk.term < currentTerm) {
			logger.warn(`Append entries request appeared from a previous term. currentTerm: ${currentTerm}, received entries request term: ${requestChunk.term}`);
			const response = requestChunk.createResponse(false, -1, false);

			return messageEmitter.send(response);
		}

		if (currentTerm < requestChunk.term) {
			currentTerm = requestChunk.term;
			props.currentTerm = currentTerm;
			props.votedFor = undefined;

			logger.debug(`Term for follower has been changed from ${currentTerm} to ${requestChunk.term}`);
		}
		// let's restart the timer
		updated = Date.now();

		// set the actual leader
		if (requestChunk.leaderId !== undefined) {
			raftEngine.leaderId = requestChunk.leaderId;
			context.extraWaitingTime = undefined;
		}

		if (requestChunk.entry === undefined && requestChunk.sequence === 0) {
			if (requestChunk.lastMessage === false) {
				logger.warn('Entries cannot be null if it is a part of chunks and thats not the last message');
				const response = requestChunk.createResponse(false, -1, true);

				return messageEmitter.send(response);
			}
			// that was a keep alive message
			if (!syncRequested) {
				updateCommitIndex(requestChunk.leaderCommit);
			}
			const response = requestChunk.createResponse(true, logs.nextIndex, true);

			return messageEmitter.send(response);
		}

		// assemble here
		let request = pendingRequests.get(requestChunk.requestId);

		if (request === undefined) {
			request = new RaftAppendEntriesRequest(requestChunk.requestId);
			pendingRequests.set(requestChunk.requestId, request);
		}
		request.add(requestChunk);
		if (request.ready === false) {
			const response = requestChunk.createResponse(true, -1, false);

			return messageEmitter.send(response);
		}
		pendingRequests.delete(requestChunk.requestId);

		logger.trace('%s Received RaftAppendEntriesRequest %o Entries: %d', localPeerId, requestChunk, request.entries?.length);

		if (logs.nextIndex < request.leaderNextIndex - (request.entries?.length ?? 0)) {
			if (syncRequested) {
				// we already requested a sync
				return;
			}
			logger.warn(`The next index is 
				${logs.nextIndex}, and the leader index is: 
				${request.leaderNextIndex}, the provided entries are: 
				${request.entries?.length}. It is insufficient to close the gap for this node. Execute sync request is necessary from the leader to request and the timeout of the raft logs should be large enough to close the gap after the sync.`,
			);
			if (raftEngine.events.emit('unresolvable-commit-gap', {
				localPeerCommitIndex: logs.commitIndex,
				leaderLowestCommitIndex: request.leaderNextIndex - (request.entries?.length ?? 0),
				callback: () => (syncRequested = false),
			})) {
				syncRequested = true;
			} else {
				throw new Error('The gap between the leader and the follower is not resolvable');
			}
			// we send success and processed response as the problem is not with the request,
			// but we do not change our next index because we cannot process it momentary due to not synced endpoint
			const response = requestChunk.createResponse(true, logs.nextIndex, true);

			return messageEmitter.send(response);
		}

		// if we arrived in this point we know that the sync is possible.
		const entryLength = request.entries.length;
		const localNextIndex = logs.nextIndex;
		let success = true;

		for (let i = 0; i < entryLength; ++i) {
			const logIndex = request.leaderNextIndex - entryLength + i;
			const entry = request.entries[i];

			if (logIndex < localNextIndex) {
				const oldLogEntry = logs.compareAndOverride(logIndex, currentTerm, entry);

				if (oldLogEntry != null && currentTerm < oldLogEntry.term) {
					logger.warn(`We overrode an entry coming from a higher term we currently had. 
                        (currentTerm: ${currentTerm}, old log entry term: ${oldLogEntry.term}). This can cause a potential inconsistency if other peer has not override it as well`
					);
				}
			} else if (!logs.compareAndAdd(logIndex, currentTerm, entry)) {
				logger.warn('Log for index {} not added, though it supposed to', logIndex);
				success = false;
			}
		}
		
		updateCommitIndex(requestChunk.leaderCommit);
		const response = requestChunk.createResponse(success, logs.nextIndex, true);

		messageEmitter.send(response);
	};
	const voteRequestListener = (request: RaftVoteRequest) => {
		logger.trace('%s Received a vote request %o, votedFor: %s', localPeerId, request, props.votedFor);
		if (request.term <= props.currentTerm) {
			// someone requested a vote from a previous or equal term.
			return messageEmitter.send(request.createResponse(false));
		}
        
		if (0 < logs.commitIndex) {
			// if this follower has committed logs!
			if (request.lastLogIndex < logs.commitIndex) {
				// if the highest index of the candidate is smaller than the commit index of this,
				// then that candidate should not lead this cluster, and wait for another leader who can
				return messageEmitter.send(request.createResponse(false));
			}    
		}
        
		let voteGranted = props.votedFor === undefined;

		if (voteGranted) {
			// when we vote for this candidate for the first time,
			// let's restart the timer, so we wait a bit more to give time to win the election before we run for presidency.
			props.votedFor = request.candidateId;
			updated = Date.now();
		} else {
			// maybe we already voted for the candidate itself?
			voteGranted = props.votedFor === request.candidateId;
		}
		const response = request.createResponse(voteGranted);

		logger.debug(`${localPeerId} send a vote response %o.`, response);
		messageEmitter.send(response);
	};
	const close = () => {
		if (closed) return;
		closed = true;
		messageEmitter.off('RaftVoteRequest', voteRequestListener);		
		messageEmitter.off('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);

		logger.debug('%s FollowerState is closed', localPeerId);
	};

	messageEmitter.on('RaftVoteRequest', voteRequestListener);
	messageEmitter.on('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);

	const run = () => {
		const now = Date.now();
		const elapsedInMs = now - updated;

		if (elapsedInMs <= config.followerMaxIdleInMs + (context.extraWaitingTime ?? 0)) {
			// we have still time before we start an election
			return;
		}
		// we don't know a leader at this point
		raftEngine.leaderId = undefined;
		if (raftEngine.remotePeers.size < 1) {
			// if we are alone, there is no point to start an election
			return;
		}

		logger.debug(`${localPeerId} is timed out to wait for append logs request (maxIdle: ${config.followerMaxIdleInMs}, elapsed: ${elapsedInMs}) extraWaitingTime: ${context.extraWaitingTime}`);

		if (config.onlyFollower) {
			updated = now;
			context.extraWaitingTime = Math.max(config.followerMaxIdleInMs, Math.min((context.extraWaitingTime ?? 0) * 2, 30000));
			
			return logger.debug('This peer is configured to be only a follower. It will not start an election.');
		}
		
		raftEngine.state = createRaftCandidateState({
			electionTerm: props.currentTerm + 1,
			raftEngine,
		});
	};

	return {
		stateName: 'follower' as const,
		run,
		close,
	};
}
