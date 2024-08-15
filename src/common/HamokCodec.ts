export interface HamokEncoder<U, R> {
	encode(data: U): R;
}

export interface HamokDecoder<U, R> {
	decode(data: R): U;
}

const EMPTY_MAP = new Map();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMPTY_SET = new Set<any>();

export function createHamokCodec<U, R>(encode: (input: U) => R, decode: (input: R) => U): HamokCodec<U, R> {
	return {
		encode,
		decode,
	};
}

export function createHamokJsonBinaryCodec<T>(): HamokCodec<T, Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	return {
		encode: (data: T) => {
			const jsonString = JSON.stringify(data);
			const encoded = encoder.encode(jsonString);
            
			return encoded;
		},
		decode: (data: Uint8Array) => {
			const jsonString = decoder.decode(data);
			const decoded = JSON.parse(jsonString);
            
			return decoded;
		},
	};
}

export function createHamokJsonStringCodec<T>(): HamokCodec<T, string> {

	return {
		encode: (data: T) => JSON.stringify(data),
		decode: (data: string) => JSON.parse(data),
	};
}

export interface HamokCodec<U, R> extends HamokEncoder<U, R>, HamokDecoder<U, R> {}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class FacadedHamokCodec<TIn = any, TOut = any> implements HamokCodec<TIn, TOut> {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	public static wrap<U = any, R = any>(codec: HamokCodec<U, R>): FacadedHamokCodec<U, R> {
		const facadedCodec = new FacadedHamokCodec(codec);
        
		return facadedCodec;
	}
	private _codec: HamokCodec<TIn, TOut>;
	private constructor(firstEncoder: HamokCodec<TIn, TOut>) {
		this._codec = firstEncoder;
	}

	encode(data: TIn): TOut {
		return this._codec.encode(data);
	}

	decode(data: TOut): TIn {
		return this._codec.decode(data);
	}

	public then<TNextOut = TOut>(nextCodec: HamokCodec<TOut, TNextOut>): FacadedHamokCodec<TIn, TNextOut> {
		const actualCodec = this._codec;
        
		return FacadedHamokCodec.wrap<TIn, TNextOut>({
			encode(data: TIn): TNextOut {
				const encodedValue: TOut = actualCodec.encode(data);
                
				return nextCodec.encode(encodedValue);
			},
			decode(data: TNextOut): TIn {
				const decodedValue: TOut = nextCodec.decode(data);
                
				return actualCodec.decode(decodedValue);
			},
		});
	}
}

export function encodeCollection<K>(keys: IterableIterator<K>, keyCodec: HamokCodec<K, Uint8Array>): Uint8Array[] {
	const result: Uint8Array[] = [];

	for (const key of keys) {
		const encodedKey = keyCodec.encode(key);

		result.push(encodedKey);
	}
	
	return result;
}

export function decodeCollection<K>(keys: IterableIterator<Uint8Array>, keyCodec: HamokCodec<K, Uint8Array>): K[] {
	const result: K[] = [];

	for (const key of keys) {
		const decodedKey = keyCodec.decode(key);

		result.push(decodedKey);
	}
	
	return result;
}

export function encodeSet<K>(keys: ReadonlySet<K>, keyCodec: HamokCodec<K, Uint8Array>): Uint8Array[] {
	if (keys.size < 1) {
		return [];
	}
	
	return encodeCollection(keys.values(), keyCodec);
}

export function decodeSet<K>(keys: Uint8Array[], keyCodec: HamokCodec<K, Uint8Array>): ReadonlySet<K> {
	if (keys.length < 1) {
		return EMPTY_SET;
	}
	
	return new Set(decodeCollection(keys.values(), keyCodec));
}

export function encodeMap<K, V>(entries: ReadonlyMap<K, V>, keyCodec: HamokCodec<K, Uint8Array>, valueCodec: HamokCodec<V, Uint8Array>): [Uint8Array[], Uint8Array[]] {
	if (entries.size < 1) {
		return [ [], [] ];
	}
	const encodedKeys: Uint8Array[] = [];
	const encodedValues: Uint8Array[] = [];

	for (const [ key, value ] of entries) {
		const encodedKey = keyCodec.encode(key);
		const encodedValue = valueCodec.encode(value);

		encodedKeys.push(encodedKey);
		encodedValues.push(encodedValue);
	}
	
	return [ encodedKeys, encodedValues ];
}

export function decodeMap<K, V>(keys: Uint8Array[], values: Uint8Array[], keyCodec: HamokCodec<K, Uint8Array>, valueCodec: HamokCodec<V, Uint8Array>): ReadonlyMap<K, V> {
	if (keys.length < 1 || values.length < 1) {
		return EMPTY_MAP;
	}
	const result = new Map<K, V>();
	const length = Math.min(keys.length, values.length);

	for (let i = 0; i < length; ++i) {
		const key = keys[i];
		const value = values[i];
		const decodedKey = keyCodec.decode(key);
		const decodedValue = valueCodec.decode(value);

		result.set(decodedKey, decodedValue);
	}
	
	return result;
}

export function encodeNumber(value: number): Uint8Array {
	const buffer = new ArrayBuffer(4);
	const view = new DataView(buffer);

	view.setInt32(0, value);
	
	return new Uint8Array(buffer);
}

export function createNumberToUint8ArrayCodec(length: 2 | 4 | 8 = 4): HamokCodec<number, Uint8Array> {
	return {
		encode: (data: number) => {
			const buffer = new ArrayBuffer(length);
			const view = new DataView(buffer);

			switch (length) {
				case 2:
					view.setInt16(0, data);
					break;
				case 4:
					view.setInt32(0, data);
					break;
				case 8:
					view.setBigInt64(0, BigInt(data));
					break;
			}
			
			return new Uint8Array(buffer);
		},
		decode: (data: Uint8Array) => {
			const view = new DataView(data.buffer);
			
			switch (length) {
				case 2:
					return view.getInt16(0);
				case 4:
					return view.getInt32(0);
				case 8:
					return Number(view.getBigInt64(0));
			}
		},
	};
}

export function createStrToUint8ArrayCodec(encoding: BufferEncoding = 'utf-8'): HamokCodec<string, Uint8Array> {
	return {
		encode: (data: string) => Buffer.from(data, encoding),
		decode: (data: Uint8Array) => Buffer.from(data).toString(encoding),
	};
}
