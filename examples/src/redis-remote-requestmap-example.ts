import { Hamok, HamokMessage, setHamokLogLevel } from 'hamok';
import Redis from 'ioredis';
import * as pino from 'pino';
import { createRedisRemoteMap } from './utils/RedisRemoteMap';
import EventEmitter from 'events';

const logger = pino.pino({
	name: 'redis-remote-requestmap-example',
	level: 'debug',
});;

type RequestMap = {
	'my-request-type': {
		parameters: [string, number];
		response: string;
	},
	'my-other-request-type': {
		parameters: [string];
		response: number;
	},
}

type PendingRequest = {
	requestId: string;
	type: keyof RequestMap;
	parameters: unknown[];
	result?: unknown;
	error?: string;
}

const publisher = new Redis();
const subscriber = new Redis();
const channelId = 'hamok-channel';
const mapId = 'cached-items' + Math.random();


export async function run() {
	setHamokLogLevel('warn');

	const [
		{ server: server_1, requestor: requestor_1 },
		{ server: server_2, requestor: requestor_2 },
	] = await Promise.all([
		createTools(),
		createTools(),
		// last
		subscriber.subscribe(channelId),
	]);

	await Promise.all([
		server_1.join(),
		server_2.join(),
	]);

	requestor_1.on('my-request-type', (param1, param2, resolve, reject) => {
		logger.info('Received request my-request-type with parameters %s and %s', param1, param2);
		resolve('result');
	});

	requestor_2.on('my-other-request-type', (param1, resolve, reject) => {
		logger.info('Received request my-other-request-type with parameter %s', param1);
		resolve(42);
	});

	const result_1 = await requestor_2.request('my-request-type', 'param1', 42);
	const result_2 = await requestor_1.request('my-other-request-type', 'param1');

	logger.info('Result of my-request-type: %s', result_1);
	logger.info('Result of my-other-request-type: %s', result_2);

	await server_1.waitUntilCommitHead();
	await server_2.waitUntilCommitHead();

	server_1.close();
	server_2.close();
}

async function createTools() {
	type RequestEventMap = {
		[key in keyof RequestMap]: [...RequestMap[key]['parameters'], (result: RequestMap[key]['response']) => void, (error: string) => void];
	}
	const server = new Hamok();
	const storage = server.createRemoteMap<string, PendingRequest>({
		mapId,
		remoteMap: createRedisRemoteMap<PendingRequest>(mapId, publisher),
	});
	const ownedRequests = new Map<string, { resolve: (result: any) => void, reject: (error: string) => void}>();
	const requestor = new class extends EventEmitter<RequestEventMap> {
		request<T extends keyof RequestMap>(requestType: T, ...parameters: RequestMap[T]['parameters']): Promise<RequestMap[T]['response']> {
			const requestId = Math.random().toString(36).slice(2);
			return new Promise((resolve, reject) => {
				const request: PendingRequest = {
					requestId,
					type: requestType,
					parameters,
				};
				ownedRequests.set(requestId, { resolve, reject });
				storage.set(requestId, request);
			});
		}
	}
	const resolveRequest = async (request: PendingRequest, result: unknown) => {
		if (!request) {
			return;
		}
		request.result = result;
		try {
			await storage.set(request.requestId, request);
		} catch (err) {
			logger.error('Failed to resolve request: %s', err);
		}
	}
	const rejectRequest = async (request: PendingRequest, error: string) => {
		if (!request) {
			return;
		}
		request.error = error;
		try {
			await storage.set(request.requestId, request);
		} catch (err) {
			logger.error('Failed to reject request: %s', err);
		}
	}

	const onRequestChanged = (newValue: PendingRequest, oldValue?: PendingRequest) => {
		if (!oldValue) {
			const resolve = (result: unknown) => resolveRequest(newValue, result);
			const reject = (error: string) => rejectRequest(newValue, error);
			const parameters = [
				...newValue.parameters,
				resolve,
				reject,
			];

			return requestor.emit(newValue.type, ...(parameters as any));
		}

		const pendingRequest = ownedRequests.get(newValue.requestId);
		if (!pendingRequest) return;

		if (newValue.result !== undefined) {
			pendingRequest.resolve(newValue.result);
			storage.delete(newValue.requestId).catch(err => logger.error('Failed to delete request: %s', err));
		} else if (newValue.error) {
			pendingRequest.reject(newValue.error);
			storage.delete(newValue.requestId).catch(err => logger.error('Failed to delete request: %s', err));
		}
	}
	
	subscriber.on('messageBuffer', (channel, buffer) => {
		server.accept(HamokMessage.fromBinary(buffer));
	});
	server.on('message', message => publisher.publish(channelId, Buffer.from(message.toBinary())));
	storage.on('insert', (key, value) => onRequestChanged(value));
	storage.on('update', (key, oldValue, newValue) => onRequestChanged(newValue, oldValue));
	
	return {
		server,
		requestor,
	};
}

if (require.main === module) {
	logger.info('Running from module file');
	setHamokLogLevel('info');
	run();
}

