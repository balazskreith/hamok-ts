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
	const updateCommitIndex = (leaderCommitIndex: number) => {
		logger.trace('%s updateCommitIndex leaderCommitIndex: %d, logsCommitIndex: %d', localPeerId, leaderCommitIndex, logs.commitIndex);
		if (leaderCommitIndex <= logs.commitIndex) {
			return;
		}
		const expectedCommitIndex = Math.min(logs.nextIndex - 1, leaderCommitIndex);

		if (expectedCommitIndex <= logs.commitIndex) {
			return;
		}
		const committedLogEntries = logs.commitUntil(expectedCommitIndex);

		logger.trace('%s updateCommitIndex committedLogEntries: %d', localPeerId, committedLogEntries.length);

		for (const logEntry of committedLogEntries) {
			logger.trace('%s commit log entry %d', localPeerId, logEntry.index);
			raftEngine.events.emit('commit', logEntry.index, logEntry.entry);
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
			updateCommitIndex(requestChunk.leaderCommit);
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

		logger.trace('%s Received RaftAppendEntriesRequest %o Entries: %d', localPeerId, request, request.entries?.length);

		if (logs.nextIndex < request.leaderNextIndex - request.entries.length) {
			const newCommitIndex = Math.max(0, request.leaderNextIndex - (request.entries?.length ?? 0)); 

			logger.warn('%s Resetting commit index to %d. The current next index for logs is %d, and the leader index is %d. ' + 
				'the leader has %d number of logs to send, which is insufficient to close the gap between this peer and the leader.' + 
				' If snapshots for storages do not close the gap that can lead to inconsistency!'
			, 
			localPeerId,
			newCommitIndex, 
			logs.nextIndex, 
			request.leaderNextIndex, 
			request.entries?.length
			);
			raftEngine.logs.reset(newCommitIndex);

			// logger.warn('WTF %o', [ ...request.entries ].join(', '));
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
			// } else {
			// 	logger.info('%s Log for index %d added', localPeerId, logIndex);
			}
		}
		
		updateCommitIndex(requestChunk.leaderCommit);
		const response = requestChunk.createResponse(success, logs.nextIndex, true);

		messageEmitter.send(response);
	};
	const voteRequestListener = (request: RaftVoteRequest) => {
		logger.trace('%s Received a vote request %o, votedFor: %s', localPeerId, request, props.votedFor);
		// if (raftEngine.leaderId !== undefined) {
		// if we know the leader, we should not vote for anyone else, until the leader is alive
		// return messageEmitter.send(request.createResponse(false));
		// }
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
			// so we just restart the timer
			return (updated = now);
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
