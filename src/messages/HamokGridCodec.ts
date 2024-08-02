import { createStrToUint8ArrayCodec, HamokCodec, HamokDecoder, HamokEncoder } from '../common/HamokCodec';
import { createLogger } from '../common/logger';
import { StorageSyncRequest, StorageSyncResponse } from './messagetypes/StorageSync';
import { SubmitMessageRequest, SubmitMessageResponse } from './messagetypes/SubmitMessage';
import { HamokMessage, HamokMessage_MessageType as MessageType } from './HamokMessage';
import { OngoingRequestsNotification } from './messagetypes/OngoingRequests';
import * as Collections from '../common/Collections';

const logger = createLogger('GridCodec');

type Input = 
OngoingRequestsNotification |
StorageSyncRequest | 
StorageSyncResponse | 
SubmitMessageRequest |
SubmitMessageResponse
    ;

const EMPTY_ARRAY: Uint8Array[] = [];
const strCodec = createStrToUint8ArrayCodec();

export class HamokGridCodec implements HamokCodec<Input, HamokMessage> {

	public encode(input: Input): HamokMessage {
		switch (input.constructor) {
			case OngoingRequestsNotification:
				return this.encodeOngoingRequestsNotification(input as OngoingRequestsNotification);
			case StorageSyncRequest:
				return this.encodeStorageSyncRequest(input as StorageSyncRequest);
			case StorageSyncResponse:
				return this.encodeStorageSyncResponse(input as StorageSyncResponse);
			case SubmitMessageRequest:
				return this.encodeSubmitMessageRequest(input as SubmitMessageRequest);
			case SubmitMessageResponse:
				return this.encodeSubmitMessageResponse(input as SubmitMessageResponse);
			default:
				throw new Error(`Cannot encode input${ input}`);
		}
	}

	public decode(message: HamokMessage): Input {
		switch (message.type) {
			case MessageType.ONGOING_REQUESTS_NOTIFICATION:
				return this.decodeOngoingRequestsNotification(message);
			case MessageType.STORAGE_SYNC_REQUEST:
				return this.decodeStorageSyncRequest(message);
			case MessageType.STORAGE_SYNC_RESPONSE:
				return this.decodeStorageSyncResponse(message);
			case MessageType.SUBMIT_MESSAGE_REQUEST:
				return this.decodeSubmitMessageRequest(message);
			case MessageType.SUBMIT_MESSAGE_RESPONSE:
				return this.decodeSubmitMessageResponse(message);
			default:
				throw new Error(`Cannot decode message${ message}`);
		}
	}

	public encodeOngoingRequestsNotification(notification: OngoingRequestsNotification): HamokMessage {
		const keys = HamokGridCodec._encodeSet<string>(notification.requestIds, strCodec);
        
		return new HamokMessage({
			type: MessageType.ONGOING_REQUESTS_NOTIFICATION,
			destinationId: notification.destinationEndpointId,
			keys,
		});
	}

	public decodeOngoingRequestsNotification(message: HamokMessage): OngoingRequestsNotification {
		if (message.type !== MessageType.ONGOING_REQUESTS_NOTIFICATION) {
			throw new Error('decodeOngoingRequestsNotification(): Message type must be ONGOING_REQUESTS_NOTIFICATION');
		}
		const requestIds = HamokGridCodec._decodeSet<string>(message.keys, strCodec);
        
		return new OngoingRequestsNotification(
			requestIds,
			message.destinationId,
		);
	}

	public encodeStorageSyncRequest(request: StorageSyncRequest): HamokMessage {
		return new HamokMessage({
			type: MessageType.STORAGE_SYNC_REQUEST,
			requestId: request.requestId,
			destinationId: request.leaderId,
			sourceId: request.sourceEndpointId,
		});
	}

	public decodeStorageSyncRequest(message: HamokMessage): StorageSyncRequest {
		if (message.type !== MessageType.STORAGE_SYNC_REQUEST) {
			throw new Error('decodeStorageSyncRequest(): Message type must be STORAGE_SYNC_REQUEST');
		}
		
		return new StorageSyncRequest(
			message.requestId!,
			message.destinationId!,
			message.sourceId,
		);
	}

	public encodeStorageSyncResponse(response: StorageSyncResponse): HamokMessage {
		return new HamokMessage({
			type: MessageType.STORAGE_SYNC_RESPONSE,
			requestId: response.requestId,
			destinationId: response.destinationId,
			raftLeaderId: response.leaderId,
			raftNumberOfLogs: response.numberOfLogs,
			raftLastAppliedIndex: response.lastApplied,
			raftCommitIndex: response.commitIndex,
		});
	}

	public decodeStorageSyncResponse(message: HamokMessage): StorageSyncResponse {
		if (message.type !== MessageType.STORAGE_SYNC_RESPONSE) {
			throw new Error('decodeStorageSyncResponse(): Message type must be STORAGE_SYNC_RESPONSE');
		}
		
		return new StorageSyncResponse(
			message.requestId!,
			message.destinationId!,
			message.raftLeaderId!,
			message.raftNumberOfLogs,
			message.raftLastAppliedIndex,
			message.raftCommitIndex
		);
	}

	public encodeSubmitMessageRequest(request: SubmitMessageRequest): HamokMessage {
		return new HamokMessage({
			type: MessageType.SUBMIT_MESSAGE_REQUEST,
			requestId: request.requestId,
			embeddedMessages: [ request.entry! ],
			sourceId: request.sourceEndpointId,
			destinationId: request.destinationEndpointId,
		});
	}

	public decodeSubmitMessageRequest(message: HamokMessage): SubmitMessageRequest {
		if (message.type !== MessageType.SUBMIT_MESSAGE_REQUEST) {
			throw new Error('decodeSubmitMessageRequest(): Message type must be SUBMIT_MESSAGE_REQUEST');
		}
		let entry: HamokMessage | undefined;

		if (message.embeddedMessages && 0 < message.embeddedMessages.length) {
			entry = message.embeddedMessages[0];
			if (1 < message.embeddedMessages.length) {
				logger.warn('decodeSubmitMessageRequest(): More than one message received for SubmitMessageRequest. Only the first one will be processed');
			}
		}
		
		return new SubmitMessageRequest(
			message.requestId!,
			message.sourceId!,
			entry!,
			message.destinationId,
		);
	}

	public encodeSubmitMessageResponse(response: SubmitMessageResponse): HamokMessage {
		return new HamokMessage({
			type: MessageType.SUBMIT_MESSAGE_RESPONSE,
			requestId: response.requestId,
			success: response.success,
			destinationId: response.destinationEndpointId,
			raftLeaderId: response.leaderId,
		});
	}

	public decodeSubmitMessageResponse(message: HamokMessage): SubmitMessageResponse {
		if (message.type !== MessageType.SUBMIT_MESSAGE_RESPONSE) {
			throw new Error('decodeSubmitMessageResponse(): Message type must be SUBMIT_MESSAGE_RESPONSE');
		}
		
		return new SubmitMessageResponse(
			message.requestId!,
			Boolean(message.success),
			message.destinationId!,
			message.raftLeaderId!,
		);
	}

	private static _encodeSet<T>(keys: ReadonlySet<T>, encoder: HamokEncoder<T, Uint8Array>): Uint8Array[] {
		if (keys.size < 1) {
			return EMPTY_ARRAY;
		}
		const result: Uint8Array[] = [];

		for (const key of keys) {
			const encodedKey = encoder.encode(key);

			result.push(encodedKey);
		}
		
		return result;
	}

	private static _decodeSet<T>(keys: Uint8Array[], decoder: HamokDecoder<T, Uint8Array>): ReadonlySet<T> {
		if (keys.length < 1) {
			return Collections.EMPTY_SET;
		}
		const result = new Set<T>();

		for (let i = 0; i < keys.length; ++i) {
			const key = keys[i];
			const decodedKey = decoder.decode(key);

			result.add(decodedKey);
		}
		
		return result;
	}

}