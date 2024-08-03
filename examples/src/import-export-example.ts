import { Hamok, HamokSnapshot, setHamokLogLevel } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'import-export-example',
	level: 'debug',
});

export async function run() {
	let latestSnapshot: HamokSnapshot | undefined;
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const server_3 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));

	server_1.on('commit', createCommitListener(server_1, snapshot => (latestSnapshot = snapshot)));
	server_2.on('commit', createCommitListener(server_2, snapshot => (latestSnapshot = snapshot)));
	server_3.on('commit', createCommitListener(server_3, snapshot => (latestSnapshot = snapshot)));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.start();
	server_2.start();

	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);

	logger.info('Leader changed');

	const queue_1 = server_1.createQueue<number>({
		queueId: 'my-distributed-queue',
	});

	for (let i = 0; i < 30; i++) await queue_1.push(i);

	// before we start we apply the snapshot
	logger.info('Importing snapshot for server_3 %o', latestSnapshot);
	if (latestSnapshot) {
		// server_3.import(latestSnapshot);
	}


	server_3.on('message', server_1.accept.bind(server_1));
	server_3.on('message', server_2.accept.bind(server_2));
	server_3.addRemotePeerId(server_1.localPeerId);
	server_3.addRemotePeerId(server_2.localPeerId);

	server_1.on('message', server_3.accept.bind(server_3));
	server_1.addRemotePeerId(server_3.localPeerId);

	server_2.on('message', server_3.accept.bind(server_3));
	server_2.addRemotePeerId(server_3.localPeerId);


	logger.info('Starting server 3');

	await new Promise(resolve => {
		server_3.once('leader-changed', resolve);
		server_3.start();
	});

	logger.info('Leader changed');

	// and let's push some logs
	for (let i = 0; i < 30; i++) await queue_1.push(i);
	
	server_1.stop();
	server_2.stop();
	server_3.stop();
}

if (require.main === module) {
	logger.info('Running from a module file');
	setHamokLogLevel('info');
	run();
}

function createCommitListener(hamok: Hamok, exportCb: (snapshot: HamokSnapshot) => void) {
	let commitIndexAtExport: number | undefined;
	const raftLogs = hamok.raft.logs;
	return (commitIndex: number) => {
		logger.debug('Commit index: %d for hamok %s, leader: %o', commitIndex, hamok.localPeerId, hamok.leader);
		// we should not export if the grid has no leader
		if (hamok.raft.leaderId === undefined) return;
		if (commitIndexAtExport === undefined) {
			return (commitIndexAtExport = commitIndex);
		}
		if (commitIndex - commitIndexAtExport < 10) {
			return;
		}
		// we should not remove anything until we have at least 10 logs
		if (raftLogs.size < 10) return;

		raftLogs.removeUntil(raftLogs.commitIndex - 5);

		if (hamok.leader) {
			// logger.debug('Exporting snapshot for hamok %s', hamok.localPeerId);
			const snapshot = hamok.export();
			exportCb(snapshot);
		}
	}
}