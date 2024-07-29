import { HamokMessage } from './HamokMessage';

export interface ResponseChunker {
	apply(message: HamokMessage): IterableIterator<HamokMessage>
}

export function createResponseChunker(maxKeys: number, maxValues: number): ResponseChunker {
	if (maxKeys < 1 && maxValues < 1) {
		return {
			apply: (message: HamokMessage) => [ message ].values()
		};
	}

	return new ResponseChunkerImpl(maxKeys, maxValues);
}

class ResponseChunkerImpl implements ResponseChunker {
	private _maxKeys: number;
	private _maxEntries: number;

	public constructor(
		maxKeys: number,
		maxValues: number
	) {
		this._maxKeys = maxKeys;
		this._maxEntries = Math.min(maxKeys, maxValues);
	}

	public apply(message: HamokMessage): IterableIterator<HamokMessage> {
		if (message.keys === undefined || message.values === undefined) {
			return [ message ].values();
		}
		if (message.keys.length < 1) {
			return [ message ].values();
		}

		if (message.values.length < 1) {
			if (message.keys.length <= this._maxKeys) {
				return [ message ].values();
			}
			
			return this._chunkByKeys(message);
		} else {
			if (Math.max(message.keys.length, message.values.length) <= this._maxEntries) {
				return [ message ].values();
			}
			
			return this._chunkByEntries(message);
		}
	}

	private *_chunkByKeys(message: HamokMessage): IterableIterator<HamokMessage> {
		const keys = message.keys;
		let sliceStart = 0;
		let sequence = 0;

		while (sliceStart < keys.length) {
			const sliceEnd = Math.min(sliceStart + this._maxKeys, keys.length);
			const lastMessage = keys.length === sliceEnd;

			yield new HamokMessage({
				...message,
				keys: keys.slice(sliceStart, sliceEnd),
				sequence,
				lastMessage
			});
			sliceStart = sliceEnd;
			++sequence;
		}
	}

	private *_chunkByEntries(message: HamokMessage): IterableIterator<HamokMessage> {
		const keys = message.keys;
		const values = message.values;
		let sliceStart = 0;
		let sequence = 0;

		while (sliceStart < keys.length && sliceStart < values.length) {
			const sliceEnd = Math.min(sliceStart + this._maxEntries, keys.length);
			const lastMessage = keys.length === sliceEnd;

			yield new HamokMessage({
				...message,
				keys: keys.slice(sliceStart, sliceEnd),
				values: values.slice(sliceStart, sliceEnd),
				sequence,
				lastMessage
			});
			sliceStart = sliceEnd;
			++sequence;
		}
	}
}