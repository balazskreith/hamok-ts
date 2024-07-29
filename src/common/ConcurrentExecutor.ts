import { createLogger } from './logger';

type OngoingProcess = () => Promise<unknown>;

const logger = createLogger('ConcurrentExecutor');

export class ConcurrentExecutor {
	private _tasks:OngoingProcess[] = [];
	private _semaphore: number;

	public constructor(
		public readonly maxConcurrencyLevel: number
	) {
		if (maxConcurrencyLevel < 1) throw new Error('maxConcurrencyLevel must be greater than 0');

		this._semaphore = maxConcurrencyLevel;

		this.postProcess = this.postProcess.bind(this);
	}

	public execute<T = unknown>(action: () => Promise<T>) {
		return new Promise<T>((resolve, reject) => {

			const task = () => action().then(resolve)
				.catch(reject);

			this._tasks.push(task);
			this._run();
		});
	}

	private postProcess() {
		++this._semaphore;

		if (this._semaphore > this.maxConcurrencyLevel) {
			logger.warn('Semaphore is greater than maxConcurrencyLevel');

			this._semaphore = this.maxConcurrencyLevel;
		}

		this._run();
	}

	private _run() {
		if (this._tasks.length === 0 || this._semaphore === 0) return;

		const task = this._tasks.shift();

		if (!task) return;

		--this._semaphore;

		task()
			.then(() => this.postProcess())
			.catch(this.postProcess);
	}
}
