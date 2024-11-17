import { Hamok, HamokConfig, HamokEmitter, setHamokLogLevel } from 'hamok';
import * as pino from 'pino';
import { HamokMessageHub } from './utils/HamokMessageHub';

const logger = pino.pino({
	name: 'emitter-example',
	level: 'debug',
});

type ExampleEventMap = {
	'simple-request': [requestId: string, {
		'param-1': number,
	}],
	'complex-request': [requestId: string, {
		'param-1': number,
		'param-2': string,
	}],
	'response': [requestId: string, payload?: unknown, error?: string],
}

type PendingRequest<T> = {
	requestId: string,
	timer: ReturnType<typeof setTimeout>,
	resolve: (value: T) => void,
	reject: (reason: string) => void,
}

function createResponseHandler(hamok: Hamok<{requests: Map<string, PendingRequest<any>>}>) {
	return (requestId: string, payload?: unknown, error?: string) => {
		const pendingRequest = hamok.appData.requests.get(requestId);

		logger.debug('Response received by server (%s). requestId: %s, payload: %o, error: %o. do we have this request?: %s', hamok.localPeerId, requestId, payload, error, Boolean(pendingRequest));
		
		if (pendingRequest) {
			clearTimeout(pendingRequest.timer);
			hamok.appData.requests.delete(requestId);
			if (error) {
				pendingRequest.reject(error);
			} else {
				pendingRequest.resolve(payload);
			}
		}
	}
}

function createRequest<K extends keyof ExampleEventMap>(requests: Map<string, PendingRequest<any>>, emitter: HamokEmitter<ExampleEventMap>, event: K, payload: ExampleEventMap[K][1]): Promise<number> {
	const requestId = Math.random().toString(36).substring(7);
	
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject('Request timeout. event: ' + event + ', payload: ' + JSON.stringify(payload));
		}, 5000);
		requests.set(requestId, { requestId, timer, resolve, reject });

		logger.debug('Request sent by server (%s). requestId: %s, event: %s, payload: %o', emitter.connection.localPeerId, requestId, event, payload);

		emitter.notify(event, requestId as any, payload as any);
	});
}



export async function run() {

	const server_1 = new Hamok<{ requests: Map<string, PendingRequest<any>> }>({
		peerId: 'server_1',
		appData: {
			requests: new Map(),
		},
		onlyFollower: true,
	});
	const server_2 = new Hamok<{ requests: Map<string, PendingRequest<any>> }>({
		peerId: 'server_2',
		appData: {
			requests: new Map(),
		},
	});
	const server_3 = new Hamok<{ requests: Map<string, PendingRequest<any>> }>({
		peerId: 'server_3',
		appData: {
			requests: new Map(),
		},
		onlyFollower: true,
	});
	const messageHub = new HamokMessageHub();
	messageHub.add(server_1, server_2, server_3);

	await Promise.all([
		server_1.join(),
		server_2.join(),
		server_3.join(),
	]);

	logger.info('Servers are joined');

	const emitter_1 = server_1.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const emitter_2 = server_2.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});
	const emitter_3 = server_3.createEmitter<ExampleEventMap>({
		emitterId: 'my-distributed-emitter',
	});

	emitter_1.subscriptions.on('added', (event, peerId, metaData) => {
		logger.debug('On server_1 (%s) peer %s subscribed to event %s, metaData: %o. peers on event: %o', server_1.localPeerId, peerId, event, metaData, [...(emitter_1.subscriptions.getEventPeersMap(event) ?? [])]);
	});
	emitter_2.subscriptions.on('added', (event, peerId, metaData) => {
		logger.debug('On server_2 (%s) peer %s subscribed to event %s, metaData: %o. peers on event: %o', server_2.localPeerId, peerId, event, metaData, [...(emitter_2.subscriptions.getEventPeersMap(event) ?? [])]);
	});
	emitter_3.subscriptions.on('added', (event, peerId, metaData) => {
		logger.debug('On server_3 (%s) peer %s subscribed to event %s, metaData: %o. peers on event: %o', server_3.localPeerId, peerId, event, metaData, [...(emitter_3.subscriptions.getEventPeersMap(event) ?? [])]);
	});
	emitter_1.subscriptions.on('removed', (event, peerId, metaData) => {
		logger.debug('On server_1 (%s) peer %s unsubscribed from event %s, metaData: %o, peers on event: %o', server_1.localPeerId, peerId, event, metaData, [...(emitter_1.subscriptions.getEventPeersMap(event) ?? [])]);
	});
	emitter_2.subscriptions.on('removed', (event, peerId, metaData) => {
		logger.debug('On server_2 (%s) peer %s unsubscribed from event %s, metaData: %o, peers on event: %o', server_2.localPeerId, peerId, event, metaData, [...(emitter_2.subscriptions.getEventPeersMap(event) ?? [])]);
	});
	emitter_3.subscriptions.on('removed', (event, peerId, metaData) => {
		logger.debug('On server_3 (%s) peer %s unsubscribed from event %s, metaData: %o, peers on event: %o', server_3.localPeerId, peerId, event, metaData, [...(emitter_3.subscriptions.getEventPeersMap(event) ?? [])]);
	});


	await emitter_1.subscribe('simple-request', (requestId, { 'param-1': param1 }) => {
		logger.debug('Simple request received by server_1: %s, %s, %s', requestId, param1);

		emitter_1.notify('response', requestId, 10);
	});

	await emitter_2.subscribe('complex-request', (requestId, { 'param-1': param1, 'param-2': param2 }) => {
		logger.debug('Complex request received by server_2: %s, %s, %s', requestId, param1, param2);

		if (10 < param1) {
			emitter_2.notify('response', requestId, 20);
		}
	});

	await emitter_1.subscribe('complex-request', (requestId, { 'param-1': param1, 'param-2': param2 }) => {
		logger.debug('Complex request received by server_1: %s, %s, %s', requestId, param1, param2);

		if (param1 < 10) {
			emitter_1.notify('response', requestId, 10);
		}
	});

	await emitter_1.subscribe('response', createResponseHandler(server_1));
	await emitter_2.subscribe('response', createResponseHandler(server_2));
	await emitter_3.subscribe('response', createResponseHandler(server_3));

	await emitter_1.ready;
	await emitter_2.ready;
	await emitter_3.ready;

	const request_1 = createRequest(server_1.appData.requests, emitter_1, 'simple-request', { 'param-1': 5 })
	const request_2 = createRequest(server_2.appData.requests, emitter_2, 'complex-request', { 'param-1': 9, 'param-2': 'test' })
	const request_3 = createRequest(server_2.appData.requests, emitter_2, 'complex-request', { 'param-1': 20, 'param-2': 'test' })

	logger.info('Response for server : %d', await request_1);
	logger.info('Response for server : %d', await request_2);
	logger.info('Response for server : %d', await request_3);

	messageHub.remove(server_1);

	logger.info('We wait 10s')
	await new Promise(resolve => setTimeout(resolve, 10000));

	logger.info('We wait 10s')
	await new Promise(resolve => setTimeout(resolve, 10000));

	logger.info('we also add some listeners to server_2 to trigger the expiration of logs');

	server_1.close();
	server_2.close();
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}
