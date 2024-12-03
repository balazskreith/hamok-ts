import { Hamok, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'emitter-example',
	level: 'debug',
});

type ExampleEventMap = {
	'event-1': [number, string, boolean],
	'event-2': [number, string],
}

type ExampleSubscriberMetaData = {
	some: string;
}

export async function run() {

	const server_1 = new Hamok();
	const server_2 = new Hamok();
	const messageHub = new HamokMessageHub();

	messageHub.add(server_1, server_2);

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	logger.info('Servers are joined');

	const emitter_1 = await server_1.createEmitter<ExampleEventMap, ExampleSubscriberMetaData>({
		emitterId: 'my-distributed-emitter',
	}).ready;
	const emitter_2 = await server_2.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	}).ready;
	const eventListener = (number: number, string: string, boolean: boolean) => {
		logger.debug('Event-1 received by server_1: %s, %s, %s', number, string, boolean);
	};
	emitter_1.subscriptions.on('added', (event, peerId, metaData) => {
		logger.debug('On server_1 (%s) peer %s subscribed to event %s, metaData: %o', server_1.localPeerId, peerId, event, metaData);
	});
	emitter_1.subscriptions.on('removed', (event, peerId, metaData) => {
		logger.debug('On server_1 (%s) peer %s unsubscribed from event %s, metaData: %o', server_1.localPeerId, peerId, event, metaData);
	});
	emitter_1.subscriptions.on('updated', (event, peerId, newMetaData, oldMetaData) => {
		logger.debug('On server_1 (%s) peer %s updated subscription to event %s, newMetaData: %o, oldMetaData: %o', server_1.localPeerId, peerId, event, newMetaData, oldMetaData);
	});

	await emitter_1.subscribe('event-1', eventListener);
	await emitter_2.subscribe('event-1', (number: number, string: string, boolean: boolean) => {
		logger.debug('Event-1 received by server_2: %s, %s, %s', number, string, boolean);
	}, { some: 'metadata' });
	await emitter_2.subscribe('event-2', (number, string) => {
		logger.debug('Event-2 received by server_2: %s, %s', number, string);
	});

	const success1 = await emitter_2.updateSubscriptionMetaData('event-1', { some: 'new metadata' }, { some: 'metadat' });
	const success2 = await emitter_2.updateSubscriptionMetaData('event-1', { some: 'new metadata 2' }, { some: 'metadata' });
	const success3 = await emitter_2.updateSubscriptionMetaData('event-1', { some: 'new metadata 3' });
	try {
		const success4 = await emitter_2.updateSubscriptionMetaData('event-2', { some: 'new metadata 4' });
	} catch (err) {
		logger.debug('Update metadata failed: %s', err);
	}
	
	logger.debug('Update metadata success: %s, %s, %s', success1, success2, success3);

	logger.debug('Publishing event-1 from server_2');
	await emitter_2.publish('event-1', 1, 'hello', true);

	logger.debug('Publishing event-2 from server_1');
	await emitter_1.publish('event-2', 2, 'world');

	logger.debug('Unsubscribing from event-1 on server_1');
	await emitter_1.unsubscribe('event-1', eventListener);

	logger.debug('Publishing event-1 from server_2');
	await emitter_1.publish('event-1', 3, 'hello', false);

	logger.debug('Publishing event-2 from server_1');
	await emitter_1.publish('event-2', 4, 'world');

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
