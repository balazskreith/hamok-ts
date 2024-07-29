import { HamokMessage } from '../messages/HamokMessage';
import { RaftAppendEntriesRequestChunk } from '../messages/messagetypes/RaftAppendEntries';

export class RaftAppendEntriesRequest {

	private _peerId?: string;
	private _term = -1;
	private _leaderId?: string;
	private _prevLogIndex = -1;
	private _prevLogTerm = -1;
	private _leaderCommit = -1;
	private _leaderNextIndex = -1;
	private _entries = new Map<number, HamokMessage>();

	private _ready = false;
	private _endSeq = -1;
	private _created = Date.now();
	private _received = 0;

	private _entriesList: HamokMessage[] = [];
	public readonly requestId: string;

	public constructor(requestId: string) {
		this.requestId = requestId;
	}

	public add(requestChunk: RaftAppendEntriesRequestChunk): void {
		if (requestChunk.requestId !== this.requestId) {
			throw new Error(`Request id mismatch. Expected ${this.requestId}, got ${requestChunk.requestId}`);
		}
		if (this._peerId == null) {
			this._peerId = requestChunk.peerId;
		}
		if (this._term < 0) {
			this._term = requestChunk.term;
		}
		if (this._leaderId == null) {
			this._leaderId = requestChunk.leaderId;
		}
		if (this._prevLogIndex < 0) {
			this._prevLogIndex = requestChunk.prevLogIndex;
		}
		if (this._prevLogTerm < 0) {
			this._prevLogTerm = requestChunk.prevLogTerm;
		}
		if (this._leaderCommit < 0) {
			this._leaderCommit = requestChunk.leaderCommit;
		}
		if (this._leaderNextIndex < 0) {
			this._leaderNextIndex = requestChunk.leaderNextIndex;
		}
		if (requestChunk.entry != undefined) {
			const removedEntry = this._entries.get(requestChunk.sequence);

			this._entries.set(requestChunk.sequence, requestChunk.entry);
			if (removedEntry != null) {
				throw new Error(`Overwritten log entry for requestChunk: ${ requestChunk }. removedEntry: ${ removedEntry}`);
			}
		}
		if (requestChunk.lastMessage) {
			this._endSeq = requestChunk.sequence;
		}
		if (this._endSeq == 0) {
			// in this case the first message is the last,
			// so its immediately ready
			this._ready = true;
		} else if (0 < this._endSeq) {
			// in this case the saved number of entries have to be equal to the endseq
			this._ready = (this._entries.size - 1) == this._endSeq;
		}
		if (this._ready) {
			const entriesList: HamokMessage[] = [];

			for (let index = 0; index < this._entries.size; ++index) {
				const entry = this._entries.get(index);

				if (!entry) {
					continue;
				}
				entriesList.push(entry);
			}
			this._entriesList = entriesList;
		}
	}

	public get peerId(): string | undefined {
		return this._peerId;
	}

	public get term(): number {
		return this._term;
	}

	public get leaderId(): string | undefined {
		return this._leaderId;
	}

	public get prevLogIndex(): number {
		return this._prevLogIndex;
	}

	public get prevLogTerm(): number {
		return this._prevLogTerm;
	}

	public get leaderCommit(): number {
		return this._leaderCommit;
	}

	public get leaderNextIndex(): number {
		return this._leaderNextIndex;
	}

	public get entries(): HamokMessage[] {
		return this._entriesList;
	}

	public get ready(): boolean {
		return this._ready;
	}
    
	public toString(): string {
		return JSON.stringify({
			peerId: this._peerId,
			term: this._term,
			leaderId: this._leaderId,
			prevLogIndex: this._prevLogIndex,
			prevLogTerm: this._prevLogTerm,
			leaderCommit: this._leaderCommit,
			leaderNextIndex: this._leaderNextIndex,
			endSeq: this._endSeq,
			ready: this._ready
		}, null, 2);
	}
}