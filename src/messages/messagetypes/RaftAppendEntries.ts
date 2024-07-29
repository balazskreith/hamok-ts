import { HamokMessage } from '../HamokMessage';

export class RaftAppendEntriesRequestChunk {
	public readonly requestId: string;
	public readonly peerId: string; // destination endpoint id
	public readonly leaderId: string; // source endpoint id
	public readonly leaderCommit: number;
	public readonly leaderNextIndex: number;
	public readonly prevLogIndex: number;
	public readonly prevLogTerm: number;
	public readonly term: number;
	public readonly sequence: number;
	public readonly lastMessage: boolean;
	public readonly entry?: HamokMessage;
	public constructor(
		requestId: string,
		peerId: string,
		leaderId: string, // source endpoint id
		leaderCommit: number,
		leaderNextIndex: number,
		prevLogIndex: number,
		prevLogTerm: number,
		term: number,
		sequence: number,
		lastMessage: boolean,
		entry?: HamokMessage,
	) {
		this.requestId = requestId;
		this.peerId = peerId;
		this.leaderId = leaderId;
		this.leaderCommit = leaderCommit;
		this.leaderNextIndex = leaderNextIndex;
		this.prevLogIndex = prevLogIndex;
		this.prevLogTerm = prevLogTerm;
		this.term = term;
		this.sequence = sequence;
		this.lastMessage = lastMessage;
		this.entry = entry;
	}

	public createResponse(
		success: boolean, 
		peerNextIndex: number,
		processed: boolean
	): RaftAppendEntriesResponse {
		return new RaftAppendEntriesResponse(
			this.requestId,
			this.peerId,
			this.leaderId,
			this.term,
			success,
			peerNextIndex,
			processed
		);
	}
}

export class RaftAppendEntriesResponse {
	public readonly requestId: string;
	public readonly sourcePeerId: string;
	public readonly destinationPeerId: string;
	public readonly term: number;
	public readonly success: boolean;
	public readonly peerNextIndex: number;
	public readonly processed: boolean;
	public constructor(
		requestId: string,
		sourcePeerId: string,
		destinationPeerId: string,
		term: number,
		success: boolean,
		peerNextIndex: number,
		processed: boolean,
	) {
		this.requestId = requestId;
		this.sourcePeerId = sourcePeerId;
		this.destinationPeerId = destinationPeerId;
		this.term = term;
		this.success = success;
		this.peerNextIndex = peerNextIndex;
		this.processed = processed;
	}
}
