import { createLogger } from '../common/logger';
import { HamokMessage } from './HamokMessage';

const logger = createLogger('PendingResponse');

export type PendingResponseConfig = {
	sourcePeerId: string;
	requestId: string;
}

export class PendingResponse {
	private _messages = new Map<number, HamokMessage>();
	private _endSeq = -1;
	private _result?: HamokMessage;
	public constructor(
		public readonly config: PendingResponseConfig
	) {
		// empty
	}

	public get sourcePeerId() {
		return this.config.sourcePeerId;
	}

	public get requestId() {
		return this.config.requestId;
	}

	public get isReady(): boolean {
		return this._result !== undefined;
	}

	public get result(): HamokMessage | undefined {
		return this._result;
	}

	public accept(message: HamokMessage) {
		if (this._result) {
			logger.warn('Pending Response is already assembled, newly received message is not accepted', message);
			
			return;
		}
		if (message.lastMessage === undefined) {
			logger.warn('lastMessage field is mandatory for PendingResponse', message);
			
			return;
		}
		if (message.sequence === undefined) {
			logger.warn('sequence field is mandatory for processing a pending response');
			
			return;
		}
		const removedMessage = this._messages.get(message.sequence);

		if (removedMessage !== undefined) {
			logger.warn('Duplicated sequence detected for pending response. removedMessage, actual messages', removedMessage, message);
		}
		this._messages.set(message.sequence, message);
		if (message.lastMessage === true) {
			this._endSeq = message.sequence;
		}
		if (this._endSeq < 0) {
			// not recceived the end seq yet, hence not ready
			return;
		}
		if (this._endSeq === 0) {
			// the one chunk this response has is the one just received
			this._result = message;
			this._messages.clear();
			
			return;
		}
		if (this._messages.size != this._endSeq + 1) {
			return;
		}
		const firstMessage = this._messages.get(0);

		if (!firstMessage) {
			logger.warn('Cannot assemble a pending response without the very first message', this);
			
			return;
		}
		this._result = new HamokMessage({
			...firstMessage,
			sequence: undefined,
			lastMessage: undefined
		});
		for (let seq = 1; seq <= this._endSeq; ++seq) {
			const responseChunk = this._messages.get(seq);

			if (responseChunk === undefined) {
				// wtf
				logger.warn(`Undefined response chunk foe sequence ${seq}`, this);
				continue;
			}
			if (0 < responseChunk.keys.length) {
				this._result.keys.push(...responseChunk.keys);
			}
			if (0 < responseChunk.values.length) {
				this._result.values.push(...responseChunk.values);
			}
		}
	}

	public get [Symbol.toStringTag](): string {
		const messages = Array.from(this._messages)
			.map(([ seq, msg ]) => `${seq}: ${msg}`)
			.join('\n');
        
		return `PendingResponse (endSeq: ${this._endSeq}, result: ${this._result}, messages: ${messages})`;
	}
}