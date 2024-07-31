import { createLogger } from '../common/logger';
import { RaftAppendEntriesRequestChunk, RaftAppendEntriesResponse } from '../messages/messagetypes/RaftAppendEntries';
import { RaftVoteRequest, RaftVoteResponse } from '../messages/messagetypes/RaftVote';
import { RaftEngine } from './RaftEngine';
import { RaftState } from './RaftState';
import { createRaftFollowerState } from './RaftFollowerState';
import { v4 as uuid } from 'uuid';

const logger = createLogger('RaftLeaderState');

export type RaftLeaderStateContext = {
	raftEngine: RaftEngine;
	// currentTerm: number;
};

export function createRaftLeaderState(context: RaftLeaderStateContext): RaftState {
	const {
		raftEngine
	} = context;
	const messageEmitter = raftEngine.transport;
	const props = raftEngine.props;
	const localPeerId = raftEngine.localPeerId;
	const logs = raftEngine.logs;
	const remotePeers = raftEngine.remotePeers;
	const currentTerm = props.currentTerm;

	/**
     * leaders should track the sent index per peers. the reason behinf that is if
     * the response to the append request chunks arrives slower than the updateFollower is called,
     * then the same chunks is sent to follower making it slower to respond, making this leader sending
     * the same append request with the same entries more, making the follower even slower than before,
     * and the system explode. This tracking preventing to sending the same chunk of request twice
     * until the follower does not respond normally.
     */
	const sentRequests = new Map<string, [string, number]>();
	const unsyncedRemotePeers = new Set<string>();
	let follow: () => void = () => void 0;
	let closed = false;
	const appendEntriesRequestListener = (request: RaftAppendEntriesRequestChunk) => {
		if (request.term < currentTerm) {
			return;
		}
		if (request.leaderId === undefined) {
			return logger.warn(`Append Request Chunk is received without leaderId ${request}`);

		}
		if (request.leaderId === localPeerId) {
			// loopback message?
			return;
		}
		if (!remotePeers.has(request.leaderId)) {
			return logger.warn(`%s received an append entries request from an unknown peer: ${request.leaderId}`, localPeerId);
		}
		if (currentTerm < request.term) {
			logger.warn('%s received a request from a leader with a higher term. Request: %o', localPeerId, request);
			
			return follow();
		}
		// terms are equal
		logger.warn(`Append Request Chunk is received from another leader in the same term. Selecting one leader in this case who has higher id. ${request}`);
		
		if (localPeerId.localeCompare(request.leaderId) < 0) {
			// only one can remain!
			return follow();
		}
	};
	const appendEntriesResponseListener = (response: RaftAppendEntriesResponse) => {
		if (response.term < currentTerm) {
			// this response comes from a previous term, I should not apply it in any way
			return;
		}
		if (currentTerm < response.term) {
			// I am not the leader anymore, so it is best to go back to a follower state
            
			return follow();
		}
		// now we are talking in my term...
		logger.trace('Received RaftAppendEntriesResponse', response);
		// if (localPeerId !== response.sourcePeerId) {
		// remotePeers.touch(response.sourcePeerId);
		// }

		// processed means the remote peer processed all the chunks for the request
		if (!response.processed) {
			return;
		}

		// success means that the other end successfully accepted the request
		if (!response.success) {
			// having unsuccessful response, but proceeded all of the chunks
			// means we should or can send a request again if it was a complex one.
			return sentRequests.delete(response.sourcePeerId);
		}

		const sourcePeerId = response.sourcePeerId;
		const sentRequest = sentRequests.delete(sourcePeerId);

		if (sentRequest === undefined) {
			// most likely a response to a keep alive or expired request
			return;
		}

		const peerNextIndex = response.peerNextIndex;

		props.nextIndex.set(sourcePeerId, peerNextIndex);
		props.matchIndex.set(sourcePeerId, peerNextIndex - 1);

		let maxCommitIndex = -1;

		for (const logEntry of logs) {
			if (peerNextIndex <= logEntry.index) {
				break;
			}
			// is this good here? so we will never commit things not created by our term?
			if (logEntry.term !== currentTerm) {
				continue;
			}
			let matchCount = 1;

			for (const peerId of remotePeers) {
				const matchIndex = props.matchIndex.get(peerId) ?? -1;

				if (logEntry.index <= matchIndex) {
					++matchCount;
				}
			}
			logger.trace(`
                logIndex: ${logEntry.index}, 
                matchCount: ${matchCount}, 
                remotePeerIds: ${remotePeers.size} 
                commit: ${remotePeers.size + 1 < matchCount * 2}`
			);
			if (remotePeers.size + 1 < matchCount * 2) {
				maxCommitIndex = Math.max(maxCommitIndex, logEntry.index);
			}
		}
		if (0 <= maxCommitIndex) {
			logger.trace('%s Committing index until %d at leader state', localPeerId, maxCommitIndex);
			for (const committedLogEnty of logs.commitUntil(maxCommitIndex)) {
				raftEngine.events.emit('commit', committedLogEnty.entry);
			}
		}
	};
	const voteRequestListener = (request: RaftVoteRequest) => {
		logger.warn('%s received a vote request from %s, but it is in an empty state', raftEngine.localPeerId, request.peerId);
	};
	const voteResponseListener = (response: RaftVoteResponse) => {
		logger.warn('%s received a vote response from %s, but it is in an empty state', raftEngine.localPeerId, response.sourcePeerId);
	};
	const close = () => {
		if (closed) return;
		closed = true;
		messageEmitter.off('RaftVoteRequest', voteRequestListener);		
		messageEmitter.off('RaftVoteResponse', voteResponseListener);
		messageEmitter.off('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);
		messageEmitter.off('RaftAppendEntriesResponse', appendEntriesResponseListener);

		logger.debug('%s is closed', localPeerId);
	};

	messageEmitter.on('RaftVoteRequest', voteRequestListener);
	messageEmitter.on('RaftVoteResponse', voteResponseListener);
	messageEmitter.on('RaftAppendEntriesRequestChunk', appendEntriesRequestListener);
	messageEmitter.on('RaftAppendEntriesResponse', appendEntriesResponseListener);

	const run = () => {
		if (remotePeers.size < 1) {
			logger.warn('Leader endpoint should become a follower because no remote endpoint is available');
			
			return follow();
		}
        
		// const config = this.config;
		const now = Date.now();

		for (const peerId of remotePeers) {
			const peerNextIndex = props.nextIndex.get(peerId) ?? 0;
			const prevLogIndex = peerNextIndex - 1;
			let prevLogTerm = -1;

			if (0 <= prevLogIndex) {
				const logEntry = logs.get(prevLogIndex);

				if (logEntry != null) {
					prevLogTerm = logEntry.term;
				}
			}

			const entries = logs.collectEntries(peerNextIndex);

			if (peerNextIndex < logs.lastAppliedIndex) {
				if (unsyncedRemotePeers.add(peerId)) {
					logger.warn(`Collected ${entries.length} entries, but peer ${peerId} should need ${logs.nextIndex - peerNextIndex}. The peer should request a commit sync`);
				}
			} else if (0 < unsyncedRemotePeers.size) {
				unsyncedRemotePeers.delete(peerId);
			}
			let sentRequest = sentRequests.get(peerId);

			if (sentRequest !== undefined) {
				const [ , requestCreated ] = sentRequest;
				// we kill the sent request if it is older than the threshold

				if (requestCreated < now - 30000) {
					sentRequests.delete(peerId);
					sentRequest = undefined;
				}
			}
			const requestId = uuid();
			// we should only sent an entryfull request if the remote peer does not have one, and we have something to add

			if (sentRequest === undefined && entries !== undefined && 0 < entries.length) {
				for (let sequence = 0; sequence < entries.length; ++sequence) {
					const entry = entries[sequence];
					const request = new RaftAppendEntriesRequestChunk(
						requestId,
						peerId,
						localPeerId,
						logs.commitIndex,
						logs.nextIndex,
						prevLogIndex,
						prevLogTerm,
						currentTerm,
						sequence,
						sequence == entries.length - 1,
						entry,
					);
					//                    logger.info("Sending", request);

					messageEmitter.send(request);
				}
				sentRequest = [ requestId, now ];
				sentRequests.set(peerId, sentRequest);
			} else { // no entries
				const appendEntries = new RaftAppendEntriesRequestChunk(
					requestId,
					peerId,
					localPeerId,
					logs.commitIndex,
					logs.nextIndex,
					prevLogIndex,
					prevLogTerm,
					currentTerm,
					0, // sequence
					true, // last message
					undefined, // entry
				);

				messageEmitter.send(appendEntries);
			}
		}
	};

	follow = () => {
		raftEngine.leaderId = undefined;
		raftEngine.state = createRaftFollowerState({
			raftEngine,
		});
	};

	const init = () => {
		// we need to assign it here after the state is changed
		raftEngine.leaderId = localPeerId;
	};
	
	return {
		stateName: 'leader' as const,
		run,
		close,
		init,
	};
}
