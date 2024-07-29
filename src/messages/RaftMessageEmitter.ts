import { EndpointStatesNotification } from './messagetypes/EndpointNotification';
import { HelloNotification } from './messagetypes/HelloNotification';
import { RaftAppendEntriesRequestChunk, RaftAppendEntriesResponse } from './messagetypes/RaftAppendEntries';
import { RaftVoteRequest, RaftVoteResponse } from './messagetypes/RaftVote';
import { HamokMessage, HamokMessage_MessageType as MessageType } from './HamokMessage';
import EventEmitter from 'events';

type Input = 
    HelloNotification |
    EndpointStatesNotification |
    RaftVoteRequest |
    RaftVoteResponse |
    RaftAppendEntriesRequestChunk | 
    RaftAppendEntriesResponse
    ;

type EventMap = {
	message: [message: HamokMessage]
	HelloNotification: [notification: HelloNotification]
	EndpointStatesNotification: [notification: EndpointStatesNotification]
	RaftVoteRequest: [request: RaftVoteRequest]
	RaftVoteResponse: [response: RaftVoteResponse]
	RaftAppendEntriesRequestChunk: [request: RaftAppendEntriesRequestChunk]
	RaftAppendEntriesResponse: [response: RaftAppendEntriesResponse]
};

function setToArray<T>(set?: ReadonlySet<T>): T[] | undefined {
	if (!set) return;
	
	return Array.from(set);
}

function arrayToSet<T>(array?: T[]): Set<T> | undefined {
	if (!array) return;
	
	return new Set<T>(array);
}

export class RaftMessageEmitter extends EventEmitter<EventMap> {
    
	public send(input: Input) {
		switch (input.constructor) {
			case HelloNotification:
				this.emit('message', this.encodeHelloNotification(input as HelloNotification));
				break;
			case EndpointStatesNotification:
				this.emit('message', this.encodeEndpointStateNotification(input as EndpointStatesNotification));
				break;
			case RaftVoteRequest:
				this.emit('message', this.encodeRaftVoteRequest(input as RaftVoteRequest));
				break;
			case RaftVoteResponse:
				this.emit('message', this.encodeRaftVoteResponse(input as RaftVoteResponse));
				break;
			case RaftAppendEntriesRequestChunk:
				this.emit('message', this.encodeRaftAppendEntriesRequest(input as RaftAppendEntriesRequestChunk));
				break;
			case RaftAppendEntriesResponse:
				this.emit('message', this.encodeRaftAppendEntriesResponse(input as RaftAppendEntriesResponse));
				break;
			default:
				throw new Error(`Cannot encode input ${input}`);
		}
	}

	public receive(message: HamokMessage) {
		switch (message.type) {
			case MessageType.HELLO_NOTIFICATION:
				this.emit('HelloNotification', this.decodeHelloNotification(message));
				break;                
			case MessageType.ENDPOINT_STATES_NOTIFICATION:
				this.emit('EndpointStatesNotification', this.decodeEndpointStateNotification(message));
				break;
			case MessageType.RAFT_VOTE_REQUEST:
				this.emit('RaftVoteRequest', this.decodeRaftVoteRequest(message));
				break;
			case MessageType.RAFT_VOTE_RESPONSE:
				this.emit('RaftVoteResponse', this.decodeRaftVoteResponse(message));
				break;
			case MessageType.RAFT_APPEND_ENTRIES_REQUEST_CHUNK:
				this.emit('RaftAppendEntriesRequestChunk', this.decodeRaftAppendEntriesRequest(message));
				break;
			case MessageType.RAFT_APPEND_ENTRIES_RESPONSE:
				this.emit('RaftAppendEntriesResponse', this.decodeRaftAppendEntriesResponse(message));
				break;
			default:
				throw new Error(`Cannot decode message ${message.type}`);
		}
	}

	public encodeHelloNotification(notification: HelloNotification): HamokMessage {
		return new HamokMessage({
			type: MessageType.HELLO_NOTIFICATION,
			sourceId: notification.sourcePeerId,
			destinationId: notification.destinationPeerId,
			raftLeaderId: notification.raftLeaderId,
		});
	}

	public decodeHelloNotification(message: HamokMessage): HelloNotification {
		if (message.type !== MessageType.HELLO_NOTIFICATION) {
			throw new Error('decodeHelloNotification(): Message type must be HELLO_NOTIFICATION');
		}
		
		return new HelloNotification(
			message.sourceId!,
			message.destinationId,
			message.raftLeaderId
		);
	}

	public encodeEndpointStateNotification(notification: EndpointStatesNotification): HamokMessage {
		const activeEndpointIds = setToArray<string>(notification.activeEndpointIds);
        
		return new HamokMessage({
			type: MessageType.ENDPOINT_STATES_NOTIFICATION,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
			raftTerm: notification.term,
			raftCommitIndex: notification.commitIndex,
			raftLeaderNextIndex: notification.leaderNextIndex,
			raftNumberOfLogs: notification.numberOfLogs,
			activeEndpointIds,
		});
	}

	public decodeEndpointStateNotification(message: HamokMessage): EndpointStatesNotification {
		if (message.type !== MessageType.ENDPOINT_STATES_NOTIFICATION) {
			throw new Error('decodeEndpointStateNotification(): Message type must be ENDPOINT_STATES_NOTIFICATION');
		}
		const activeEndpointIds = arrayToSet<string>(message.activeEndpointIds);
        
		return new EndpointStatesNotification(
			message.sourceId!,
			message.destinationId!,
			message.raftTerm!,
			message.raftCommitIndex!,
			message.raftLeaderNextIndex!,
			message.raftNumberOfLogs!,
			activeEndpointIds,
		);
	}

	public encodeRaftVoteRequest(request: RaftVoteRequest): HamokMessage {
		return new HamokMessage({
			type: MessageType.RAFT_VOTE_REQUEST,
			raftTerm: request.term,
			raftPrevLogIndex: request.lastLogIndex,
			raftPrevLogTerm: request.lastLogTerm,
			destinationId: request.peerId,
			raftCandidateId: request.candidateId,
		});
	}

	public decodeRaftVoteRequest(message: HamokMessage): RaftVoteRequest {
		if (message.type !== MessageType.RAFT_VOTE_REQUEST) {
			throw new Error('decodeRaftVoteRequest(): Message type must be RAFT_VOTE_REQUEST');
		}
		
		return new RaftVoteRequest(
			message.raftTerm!,
			message.raftPrevLogIndex!,
			message.raftPrevLogTerm!,
			message.destinationId!,
			message.raftCandidateId!,
		);
	}
    
	public encodeRaftVoteResponse(response: RaftVoteResponse): HamokMessage {
		return new HamokMessage({
			type: MessageType.RAFT_VOTE_RESPONSE,
			raftTerm: response.term,
			success: response.voteGranted,
			destinationId: response.destinationPeerId,
			sourceId: response.sourcePeerId,
		});
	}

	public decodeRaftVoteResponse(message: HamokMessage): RaftVoteResponse {
		if (message.type !== MessageType.RAFT_VOTE_RESPONSE) {
			throw new Error('decodeRaftVoteResponse(): Message type must be RAFT_VOTE_RESPONSE');
		}
		
		return new RaftVoteResponse(
			message.raftTerm!,
			Boolean(message.success),
			message.destinationId!,
			message.sourceId!,
		);
	}

	public encodeRaftAppendEntriesRequest(request: RaftAppendEntriesRequestChunk): HamokMessage {
		return new HamokMessage({
			type: MessageType.RAFT_APPEND_ENTRIES_REQUEST_CHUNK,
			requestId: request.requestId,
			destinationId: request.peerId,
			raftLeaderId: request.leaderId,
			raftCommitIndex: request.leaderCommit,
			raftLeaderNextIndex: request.leaderNextIndex,
			raftPrevLogIndex: request.prevLogIndex,
			raftPrevLogTerm: request.prevLogTerm,
			raftTerm: request.term,
			sequence: request.sequence,
			lastMessage: request.lastMessage,
			embeddedMessages: request.entry ? [ request.entry ] : undefined,
		});
	}

	public decodeRaftAppendEntriesRequest(message: HamokMessage): RaftAppendEntriesRequestChunk {
		if (message.type !== MessageType.RAFT_APPEND_ENTRIES_REQUEST_CHUNK) {
			throw new Error('decodeRaftAppendEntriesRequest(): Message type must be RAFT_APPEND_ENTRIES_REQUEST_CHUNK');
		}
		let entry: HamokMessage | undefined;

		if (message.embeddedMessages && 0 < message.embeddedMessages.length) {
			entry = message.embeddedMessages[0];
			if (1 < message.embeddedMessages.length) {
				throw new Error('decodeRaftAppendEntriesRequest(): More than one message received for RaftAppendRequestChunk. Only the first one will be processed');
			}
		}
		
		return new RaftAppendEntriesRequestChunk(
			message.requestId!,
			message.destinationId!,
			message.raftLeaderId!,
			message.raftCommitIndex ?? -1,
			message.raftLeaderNextIndex ?? -1,
			message.raftPrevLogIndex ?? -1,
			message.raftPrevLogTerm ?? -1,
			message.raftTerm!,
			message.sequence ?? 0,
			message.lastMessage ?? false,
			entry,
		);
	}

	public encodeRaftAppendEntriesResponse(response: RaftAppendEntriesResponse): HamokMessage {
		return new HamokMessage({
			type: MessageType.RAFT_APPEND_ENTRIES_RESPONSE,
			requestId: response.requestId,
			sourceId: response.sourcePeerId,
			destinationId: response.destinationPeerId,
			raftTerm: response.term,
			success: response.success,
			raftPeerNextIndex: response.peerNextIndex,
			lastMessage: response.processed,
		});
	}

	public decodeRaftAppendEntriesResponse(message: HamokMessage): RaftAppendEntriesResponse {
		if (message.type !== MessageType.RAFT_APPEND_ENTRIES_RESPONSE) {
			throw new Error('decodeRaftAppendEntriesResponse(): Message type must be RAFT_APPEND_ENTRIES_RESPONSE');
		}
		
		return new RaftAppendEntriesResponse(
			message.requestId!,
			message.sourceId!,
			message.destinationId!,
			message.raftTerm!,
			Boolean(message.success),
			message.raftPeerNextIndex!,
			Boolean(message.lastMessage),
		);
	}
}