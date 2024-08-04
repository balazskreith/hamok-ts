import { Hamok, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

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
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.start();
	server_2.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');
	
	const jobId = 'myJob';
	const storage_1 = server_1.createMap<string, Job>({
		mapId: 'my-replicated-storage',
		// equalValues: (a, b) => a.id === b.id && a.state === b.state,
	});
	const storage_2 = server_2.createMap<string, Job>({
		mapId: 'my-replicated-storage',
		// equalValues: (a, b) => a.id === b.id && a.state === b.state,
	});
	// const storage_3 = server_3.createReplicatedStorage<string, number>({
	// 	storageId: 'my-replicated-storage',
	// });
	
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
}

if (require.main === module) {
	logger.info('Running from a module file');
	setHamokLogLevel('info');
	run();
}

