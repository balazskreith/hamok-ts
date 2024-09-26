import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'record-update-if',
	level: 'debug',
});

type MySharedConfig = {
	foo: string;
	bar: number;
}

export async function run() {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	const storage_1 = server_1.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
	});
	const storage_2 = server_2.createRecord<MySharedConfig>({
		recordId: 'my-replicated-record',
	});

	logger.debug(`Inserting values into replicated record.`);

	const [ insertedByServer2, insertedByServer1 ] = await Promise.all([
		storage_1.insertInstance({
			bar: 1,
			foo: 'inserted-by-server-1',
		}),
		storage_2.insertInstance({
			bar: 2,
			foo: 'inserted-by-server-2',
		}),
	]);

	logger.debug('Inserted values into replicated record. %o, %o', insertedByServer1, insertedByServer2);

	if (insertedByServer1 && !insertedByServer2) logger.debug('Server 1 inserted %o', insertedByServer1);
	else if (insertedByServer2 && !insertedByServer1) logger.debug('Server 2 inserted %o', insertedByServer2);
	else throw new Error('Both servers inserted the record or neither of them');

	const [ updatedByServer1, updatedByServer2 ] = await Promise.all([
		storage_1.updateInstanceIf({bar: 5}, insertedByServer1 ?? insertedByServer2 ?? {}),
		storage_2.updateInstanceIf({bar: 5}, insertedByServer1 ?? insertedByServer2 ?? {})
	]);

	updatedByServer1 && logger.debug('Server 1 updated %o', updatedByServer1);
	updatedByServer2 && logger.debug('Server 2 updated %o', updatedByServer2);

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

