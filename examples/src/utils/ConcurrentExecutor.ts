type OngoingProcess = () => Promise<unknown>;

export function createConcurrentExecutor(maxConcurrencyLevel: number) {
	const tasks: OngoingProcess[] = [];
	let semaphore = maxConcurrencyLevel;

	const postProcess = () => {
		++semaphore;

		if (semaphore > maxConcurrencyLevel) {
			semaphore = maxConcurrencyLevel;
		}

		run();
	};

	const run = () => {
		if (tasks.length === 0 || semaphore === 0) return;

		const task = tasks.shift();

		if (!task) return;

		--semaphore;

		task()
			.then(() => postProcess())
			.catch(postProcess);
	};

	return (action: () => Promise<unknown>) => new Promise((resolve, reject) => {
		
		const task = () => action().then(resolve)
			.catch(reject);

		tasks.push(task);
		run();
	});
}
