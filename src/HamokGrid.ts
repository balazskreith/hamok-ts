import { createLogger } from './common/logger';
import { HamokMessage } from './messages/HamokMessage';
import { PendingRequest } from './messages/PendingRequest';
import { PendingResponse } from './messages/PendingResponse';
import { OngoingRequestsNotifier } from './OngoingRequestsNotifier';

const logger = createLogger('HamokTransport');

export class HamokGrid {
	public readonly pendingRequests = new Map<string, PendingRequest>();
	public readonly pendingResponses = new Map<string, PendingResponse>();

	public constructor(
		public readonly sendMessage: (message: HamokMessage, targetPeerIds?: ReadonlySet<string> | string[] | string) => void,
		public readonly submit: (message: HamokMessage) => Promise<void>,
		public readonly ongoingRequestsNotifier: OngoingRequestsNotifier,
		public readonly remotePeerIds: ReadonlySet<string>,
		public getLocalPeerId: () => string,
		public getLeaderId: () => string | undefined,
	) {
		// empty
	}

	public get localPeerId(): string {
		return this.getLocalPeerId();
	}

	public get leaderId(): string | undefined {
		return this.getLeaderId();
	}

	public async request(options: {
		message: HamokMessage,
		timeoutInMs?: number,
		neededResponses?: number,
		targetPeerIds?: ReadonlySet<string> | string[],
		submit?: boolean,
	}): Promise<HamokMessage[]> {
		const requestId = options.message.requestId;
		const storageId = options.message.storageId;

		if (!requestId) {
			logger.warn('Cannot send request message without a requestId %o', options.message);
			
			return Promise.resolve([]);
		}
		const remotePeers = options.targetPeerIds 
			? Array.isArray(options.targetPeerIds) ? new Set(options.targetPeerIds) : options.targetPeerIds 
			: undefined;
		const pendingRequest = new PendingRequest({
			requestId,
			neededResponses: options.neededResponses ?? 0,
			remotePeers,
			timeoutInMs: options.timeoutInMs ?? 0,
			storageId,
		});
		const prevPendingRequest = this.pendingRequests.get(pendingRequest.id);

		if (prevPendingRequest) {
			prevPendingRequest.reject('Request is overridden');
		}
		this.pendingRequests.set(pendingRequest.id, pendingRequest);
		try {
			if (options.submit) {
				await this.submit(options.message);
			} else {
				this.sendMessage(options.message, remotePeers);
			}
			
			const response = await pendingRequest;

			return response;
		} catch (error) {
			this.purgeResponseForRequest(requestId);
			throw error;
		} finally {
			this.pendingRequests.delete(pendingRequest.id);
		}
	}

	public processResponse(message: HamokMessage): void {
		if (!message.requestId || !message.sourceId) {
			logger.warn('_processResponse(): Message does not have a requestId or sourceId. message: %o', message);
			
			return;
		}
		const chunkedResponse = message.sequence !== undefined && message.lastMessage !== undefined;
		const onlyOneChunkExists = message.sequence === 0 && message.lastMessage === true;
		// console.warn("_responseReceived ", message);

		if (chunkedResponse && !onlyOneChunkExists) {
			const pendingResponseId = `${message.sourceId}#${message.requestId}`;
			let pendingResponse = this.pendingResponses.get(pendingResponseId);

			if (!pendingResponse) {
				pendingResponse = new PendingResponse({
					requestId: message.requestId,
					sourcePeerId: message.sourceId,
				});
				this.pendingResponses.set(pendingResponseId, pendingResponse);
			}
			pendingResponse.accept(message);
			if (!pendingResponse.isReady) {
				const pendingRequest = this.pendingRequests.get(message.requestId ?? 'notExists');
				// let's postpone the timeout if we knoe responses are coming

				if (pendingRequest) {
					pendingRequest.postponeTimeout();
				}
				
				return;
			}
			if (!this.pendingResponses.delete(pendingResponseId)) {
				logger.warn(`Unsuccessful deleting for pending response ${pendingResponseId}`);
			}
			const assembledResponse = pendingResponse.result;

			if (!assembledResponse) {
				logger.warn(`Undefined Assembled response, cannot make a response for request ${message.requestId}`, message);
				
				return;
			}
			message = assembledResponse;
		}
		if (!message.requestId) {
			logger.warn('response message does not have a requestId', message);
			
			return;
		}
		const pendingRequest = this.pendingRequests.get(message.requestId);

		if (!pendingRequest) {
			logger.warn(`Cannot find pending request for requestId ${message.requestId}`, message);
			
			return;
		}
		if (pendingRequest.completed) {
			logger.warn('Response is received for an already completed request. pendingRequest: %o, response: %o', pendingRequest, message);
			
			return;
		}
		pendingRequest.accept(message);
	}

	public purgeResponseForRequest(requestId: string) {
		const pendingResponseKeys: string[] = [];

		for (const [ key, pendingResponse ] of this.pendingResponses) {
			if (pendingResponse.requestId === requestId) {
				pendingResponseKeys.push(key);
			}
		}
		pendingResponseKeys.forEach((pendingResponseKey) => this.pendingResponses.delete(pendingResponseKey));
	}

	public purgeResponseForRequests(requestIds: string[]) {
		const requestIdSet = new Set(requestIds);
		const pendingResponseKeys: string[] = [];

		for (const [ key, pendingResponse ] of this.pendingResponses) {
			if (requestIdSet.has(pendingResponse.requestId)) {
				pendingResponseKeys.push(key);
			}
		}
		pendingResponseKeys.forEach((pendingResponseKey) => this.pendingResponses.delete(pendingResponseKey));
	}
}