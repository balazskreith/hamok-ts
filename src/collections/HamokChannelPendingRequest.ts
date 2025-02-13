import { createLogger } from '../common/logger';
import { HamokChannelRequestMessage } from './HamokChannel';

const logger = createLogger('HamokChannelPendingRequest');

export class HamokChannelPendingRequest<T> {
	public readonly promise: Promise<T[]>;
	private readonly _responses = new Map<string, T[]>();
	private _completed = false;
	private _resolve?: (value: T[]) => void;
	private _reject?: (reason: unknown) => void;
	private _timer?: ReturnType<typeof setTimeout>;

	public constructor(
		public readonly id: string,
		public readonly neededResponses: number,
		public readonly neededRemotePeers: Set<string>,
		public readonly timeoutInMs: number
	) {
		this.promise = new Promise<T[]>((resolve, reject) => {
			this._resolve = (value: T[]) => {
				if (this._timer) clearTimeout(this._timer);
				this._completed = true;
				resolve(value);
			};
			this._reject = (reason: unknown) => {
				if (this._timer) clearTimeout(this._timer);
				this._completed = true;
				reject(reason);
			};
		});
		if (0 < timeoutInMs) {
			this._timer = setTimeout(() => this._reject?.(new Error('Request timeout')), timeoutInMs);
		}
	}

	public getMessage(event: string, ...args: unknown[]): string {
		const config: HamokChannelRequestMessage = {
			type: 'request',
			requestId: this.id,
			data: args,
			event,
			timeoutInMs: this.timeoutInMs,
		};

		return JSON.stringify(config);
	}

	public accept(sourcePeerId: string, ...receivedResponses: T[]) {
		if (!this._resolve) return;

		if (0 < this.neededRemotePeers.size) {
			if (!this.neededRemotePeers.has(sourcePeerId)) return logger.warn('Received response from an unexpected peer %s', sourcePeerId);
		}

		let responses = this._responses.get(sourcePeerId);

		if (!responses) {
			responses = [];
			this._responses.set(sourcePeerId, responses);
		}

		responses.push(...receivedResponses);

		if (this.isCompleted) {
			this._resolve([ ...this._responses.values() ].flatMap((r) => r));
		}
	}

	public reject(sourcePeerId: string, error: string) {
		if (!this._reject) return;

		if (0 < this.neededRemotePeers.size) {
			if (!this.neededRemotePeers.has(sourcePeerId)) return logger.warn('Received response from an unexpected peer %s', sourcePeerId);
		}

		this._reject(error);
	}

	public removeSourcePeerId(sourcePeerId: string) {
		this.neededRemotePeers.delete(sourcePeerId);

		if (!this._resolve) return;

		if (this.isCompleted) {
			this._resolve([ ...this._responses.values() ].flatMap((r) => r));
		}
	}

	public get isCompleted() {
		if (this._completed) return true;

		let hasEnoughRemotePeers = true;

		if (0 < this.neededRemotePeers.size) {
			hasEnoughRemotePeers = this.neededRemotePeers.size <= this._responses.size;
		}

		let hasEnoughResponses = true;

		if (0 < this.neededResponses) {
			hasEnoughResponses = this.neededResponses <= this._responses.size;
		}

		return hasEnoughRemotePeers && hasEnoughResponses;
	}
}
