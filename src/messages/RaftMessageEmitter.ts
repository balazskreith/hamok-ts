import { RaftAppendEntriesRequestChunk, RaftAppendEntriesResponse } from './messagetypes/RaftAppendEntries';
import { RaftVoteRequest, RaftVoteResponse } from './messagetypes/RaftVote';
import { HamokMessage, HamokMessage_MessageProtocol as MessageProtocol, HamokMessage_MessageType as MessageType } from './HamokMessage';
import EventEmitter from 'events';
import { createLogger } from '../common/logger';

const logger = createLogger('RaftMessageEmitter');

type Input = 
    RaftVoteRequest |
    RaftVoteResponse |
    RaftAppendEntriesRequestChunk | 
    RaftAppendEntriesResponse
    ;

type EventMap = {
	message: [message: HamokMessage]
	RaftVoteRequest: [request: RaftVoteRequest]
	RaftVoteResponse: [response: RaftVoteResponse]
	RaftAppendEntriesRequestChunk: [request: RaftAppendEntriesRequestChunk]
	RaftAppendEntriesResponse: [response: RaftAppendEntriesResponse]
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface RaftMessageEmitter {
	on<U extends keyof EventMap>(event: U, listener: (...args: EventMap[U]) => void): this;
	once<U extends keyof EventMap>(event: U, listener: (...args: EventMap[U]) => void): this;
	off<U extends keyof EventMap>(event: U, listener: (...args: EventMap[U]) => void): this;
	emit<U extends keyof EventMap>(event: U, ...args: EventMap[U]): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RaftMessageEmitter extends EventEmitter {
	public constructor() {
		super();
		this.setMaxListeners(Infinity);
		
		logger.trace('RaftMessageEmitter created');
	}

	public send(input: Input) {
		
		switch (input.constructor) {
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
			case MessageType.RAFT_VOTE_REQUEST:
				// logger.debug('Received RaftVoteRequest %o, request: %o', message, this.decodeRaftVoteRequest(message));
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

	public encodeRaftVoteRequest(request: RaftVoteRequest): HamokMessage {
		return new HamokMessage({
			protocol: MessageProtocol.RAFT_COMMUNICATION_PROTOCOL,
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
			protocol: MessageProtocol.RAFT_COMMUNICATION_PROTOCOL,
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
			protocol: MessageProtocol.RAFT_COMMUNICATION_PROTOCOL,
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
			protocol: MessageProtocol.RAFT_COMMUNICATION_PROTOCOL,
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