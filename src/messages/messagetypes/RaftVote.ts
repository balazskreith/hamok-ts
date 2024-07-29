export class RaftVoteRequest {
	public readonly term: number;
	public readonly lastLogIndex: number;
	public readonly lastLogTerm: number;
	public readonly peerId: string; // destination endpoint id
	public readonly candidateId: string; // source endpoint id
	public constructor(
		term: number,
		lastLogIndex: number,
		lastLogTerm: number,
		peerId: string,
		candidateId: string, // source endpoint id
	) {
		this.term = term;
		this.lastLogIndex = lastLogIndex;
		this.lastLogTerm = lastLogTerm;
		this.peerId = peerId;
		this.candidateId = candidateId;
	}

	public createResponse(
		voteGranted: boolean, 
	): RaftVoteResponse {
		return new RaftVoteResponse(
			this.term,
			voteGranted,
			this.candidateId,
			this.peerId,
		);
	}
}

export class RaftVoteResponse {
	public readonly term: number;
	public readonly voteGranted: boolean;
	public readonly destinationPeerId: string;
	public readonly sourcePeerId: string;
	public constructor(
		term: number,
		voteGranted: boolean,
		destinationPeerId: string,
		sourcePeerId: string,
	) {
		this.term = term;
		this.voteGranted = voteGranted;
		this.destinationPeerId = destinationPeerId;
		this.sourcePeerId = sourcePeerId;
	}
}
