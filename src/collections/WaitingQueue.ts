import { createLogger } from '../common/logger';

const logger = createLogger('WaitingQueue');

type WaitingItem = {
	action: () => void;
	reject?: (reason: string) => void;
};

export class WaitingQueue {
	private _queue: WaitingItem[] = [];
	private _timer?: ReturnType<typeof setTimeout>;
	private _completed = false;

	public constructor(
		public readonly timeoutInMs: number,
		public readonly onCompleted?: () => void,
		timeoutReason?: string
	) {
		this._timer = setTimeout(() => {
			this._timer = undefined;
			this.clear(timeoutReason ?? 'Waiting Timeout');
		}, this.timeoutInMs);

		logger.trace('WaitingQueue created with timeout %d', this.timeoutInMs);
	}

	public get completed() {
		return this._completed;
	}

	public wait<T = unknown>(supplier: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this._queue.push({
				action: () => {
					supplier()
						.then(resolve)
						.catch(reject);
				},
				reject,
			});
		});
	}

	public add(action: () => void) {
		this._queue.push({ action });
	}

	public flush() {
		if (this._completed) return;
		this._completed = true;

		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = undefined;
		}

		for (const item of this._queue) {
			logger.trace('WaitingQueue item is executed');
			item.action();
		}

		this._queue = [];
		this.onCompleted?.();
	}

	public clear(rejectReason?: string) {
		if (this._completed) return;
		this._completed = true;

		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = undefined;
		}

		for (const item of this._queue) {
			logger.trace('WaitingQueue item is rejected: %s', rejectReason);
			item.reject?.(rejectReason ?? 'Queue is cleared');
		}

		this._queue = [];
		this.onCompleted?.();
	}
}
