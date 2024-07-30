export interface HamokEncoder<U, R> {
	encode(data: U): R;
}

export interface HamokDecoder<U, R> {
	decode(data: R): U;
}

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