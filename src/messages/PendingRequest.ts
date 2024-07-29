import { createLogger } from '../common/logger';
import { HamokMessage } from './HamokMessage';

const logger = createLogger('PendingRequest');

export type PendingRequestConfig = {
	readonly requestId: string;
	timeoutInMs?: number;
	neededResponses?: number;
	remotePeers?: ReadonlySet<string>;
}

export type PendingRequestState = 'pending' | 'resolved' | 'rejected';

export class PendingRequest implements Promise<ReadonlyArray<HamokMessage>> {
	public readonly responses = new Map<string, HamokMessage>();
	
	private _postponeTimeout = false;
	private _state: PendingRequestState = 'pending';
	private _receivedResponses = 0;
	private _timer?: ReturnType<typeof setTimeout>;
	private _promise: Promise<HamokMessage[]>;
	private _resolve?: () => void;
	private _reject?: (reason: string) => void;
	// private _promise?: CompletablePromise<Message[]>;

	public constructor(public readonly config: PendingRequestConfig) {
		if (this.config.timeoutInMs) {
			if (this.config.timeoutInMs < 1) {
				throw new Error('Timeout for a pending promise if given must be greater than 0');
			}
			const process = () => {
				if (this._timer === undefined) {
					return;
				}
				this._timer = undefined;
				if (!this._promise) {
					return;
				}
				if (this._postponeTimeout) {
					this._postponeTimeout = false;
					
					return (this._timer = setTimeout(process, this.config.timeoutInMs));
				}
				if (this._reject) {
					this._reject(`Timeout. requestId: ${this.id}, number of received response: ${this._receivedResponses}`);
				} else {
					logger.warn(`No reject function is defined for pending promise ${this} but the timeout elpased.`);
				}
			};
    
			this._timer = setTimeout(process, this.config.timeoutInMs);
		}
		this._promise = new Promise<HamokMessage[]>((resolve, reject) => {
			this._resolve = () => {
				if (this._timer) {
					clearTimeout(this._timer);
					this._timer = undefined;
				}
				const response = Array.from(this.responses.values());

				logger.trace(`Pending request is resolved by responses ${response}`);
				/* eslint-disable @typescript-eslint/no-non-null-assertion */
				resolve(response);
				this._resolve = undefined;
				this._reject = undefined;
				this._state = 'resolved';
			};
			this._reject = (reason: string) => {
				if (this._timer) {
					clearTimeout(this._timer);
					this._timer = undefined;
				}
				reject(reason);
				this._resolve = undefined;
				this._reject = undefined;
				this._state = 'rejected';
			};
		});
	}

	public get id() {
		return this.config.requestId;
	}

	public get completed() {
		return this._state !== 'pending';
	}

	public get state() {
		return this._state;
	}

	public then<TResult1 = HamokMessage[], TResult2 = never>(onfulfilled?: ((value: HamokMessage[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: string) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
		return this._promise.then(onfulfilled, onrejected);
	}
    
	public catch<TResult = never>(onrejected?: ((reason: string) => TResult | PromiseLike<TResult>) | null): Promise<HamokMessage[] | TResult> {
		return this._promise.catch(onrejected);
	}
    
	public finally(onfinally?: (() => void) | null): Promise<HamokMessage[]> {
		return this._promise.finally(onfinally);
	}

	// private _resolve(): void {
	// 	if (this._timer) {
	// 		clearTimeout(this._timer);
	// 		this._timer = undefined;
	// 	}
	// 	if (!this._promise) {
	// 		return logger.warn(`Attempted to resolve a not pending request (${this})`);
	// 	}
	// 	const response = Array.from(this._responses.values());

	// 	logger.trace(`Pending request is resolved by responses ${response}`);
	// 	/* eslint-disable @typescript-eslint/no-non-null-assertion */
	// 	this._promise!.resolve(response);
	// }

	public accept(message: HamokMessage): void {
		if (message.sourceId === undefined || message.requestId === undefined) {
			logger.warn('No source or request id is assigned for message:', message);
			
			return;
		}
		
		const prevResponse = this.responses.get(message.sourceId);

		if (prevResponse) {
			logger.warn(`Remote endpoint ${message.sourceId} overrided its previous response for request ${this.id}. removed response`, message);
		}
		this.responses.set(message.sourceId, message);
        
		this.refresh();
	}

	/**
     * Explicitly reject the pending request if it is in the pending state
     * @param reason 
     * @returns 
     */
	reject(reason: string): void {
		if (this.completed || !this._reject) return logger.warn(`Attempted to reject a not pending request (${this})`);

		this._reject(reason);
	}

	/**
     * Explicitly resolve the pending request if it is in the pending state
     * @returns 
     */
	resolve(): void {
		if (this.completed || !this._resolve) return logger.warn(`Attempted to resolve a not pending request (${this})`);

		if (!this.isReady) {
			logger.warn(`Resolving a pending request ${this} before it is ready`);
		}

		this._resolve();
	}

	/**
     * Check if the pending request can be resolved or not
     * This is automatically called after any message accepted, but if the endpoints changed or 
     * some other external event happened it can be called explicitly.
     * @returns 
     */
	public refresh(): void {
		if (this.completed || !this._resolve) return;
		if (!this.isReady) return;

		this._resolve();
	}

	private get isReady() {
		let noMoreNeededResponse = true;

		if (this.config.neededResponses) {
			++this._receivedResponses;
			noMoreNeededResponse = this.config.neededResponses <= this._receivedResponses;
		}

		let noMorePendingPeers = true;

		if (this.config.remotePeers) {
			let pendingPeerIds = this.config.remotePeers.size;

			for (const resolvedPeerId of this.responses.keys()) {
				if (this.config.remotePeers.has(resolvedPeerId)) {
					--pendingPeerIds;
				} else {
					logger.warn(`Remote peer ${resolvedPeerId} is not in the list of remote peers for request ${this.id}`);
				}
			}
			noMorePendingPeers = pendingPeerIds < 1;
		}

		return noMoreNeededResponse && noMorePendingPeers;
	}

	public postponeTimeout(): void {
		this._postponeTimeout = true;
		logger.debug(`Pending Request ${this} is postponed`);
	}

	public get [Symbol.toStringTag](): string {
		return 'PendingRequest';
	}
}