import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'map-update-if-example',
	level: 'debug',
});

type Job = {
	id: string;
	state: 'pending' | 'running' | 'completed';
	executedBy?: string;
};

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const messageHub = new HamokMessageHub();
	const jobId = 'myJob';
	const storage_1 = server_1.createMap<string, Job>({
		mapId: 'my-replicated-storage',
		// equalValues: (a, b) => a.id === b.id && a.state === b.state,
	});
	const storage_2 = server_2.createMap<string, Job>({
		mapId: 'my-replicated-storage',
		// equalValues: (a, b) => a.id === b.id && a.state === b.state,
	});

	Promise.all([
		server_1.join(),
		server_2.join(),
	]);
	
	logger.debug('Setting value in storage for key to 0');	
	await storage_1.set(jobId, { id: jobId, state: 'pending' });
	// await storage_1.set('key', 2);

	logger.info('Getting value from replicated storage: %o', storage_1.get(jobId));

	logger.debug('Updating value in storage for key to 1 if previous value is 0, or to 3 if previous value is 2');
	const [changedByServer_1, changedByServer_2] = await Promise.all([
		storage_1.updateIf(jobId, { id: jobId, state: 'running', executedBy: server_1.localPeerId }, { id: jobId, state: 'pending' }),
		storage_2.updateIf(jobId, { id: jobId, state: 'running', executedBy: server_2.localPeerId }, { id: jobId, state: 'pending' }),
	])
	
	await storage_1.set('not-important-key', { id: 'another-job', state: 'pending' });
	logger.debug('%s job entry is updated by server_1: %o', jobId, changedByServer_1);
	logger.debug('%s job entry is updated by server_2: %o', jobId, changedByServer_2);

	logger.debug('Getting value for %s from storage: %o', jobId, storage_1.get(jobId));

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from a module file');
	setHamokLogLevel('info');
	run();
}

