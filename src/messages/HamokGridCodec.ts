import { createStrToUint8ArrayCodec, HamokCodec, HamokDecoder, HamokEncoder } from '../common/HamokCodec';
import { createLogger } from '../common/logger';
import { StorageSyncRequest, StorageSyncResponse } from './messagetypes/StorageSync';
import { SubmitMessageRequest, SubmitMessageResponse } from './messagetypes/SubmitMessage';
import { HamokMessage, HamokMessage_MessageProtocol as HamokMessageProtocol, HamokMessage_MessageType as MessageType } from './HamokMessage';
import { OngoingRequestsNotification } from './messagetypes/OngoingRequests';
import * as Collections from '../common/Collections';
import { EndpointStatesNotification } from './messagetypes/EndpointNotification';
import { HelloNotification } from './messagetypes/HelloNotification';
import { JoinNotification } from './messagetypes/JoinNotification';

const logger = createLogger('GridCodec');

type Input = 
HelloNotification |
JoinNotification | 
EndpointStatesNotification |
OngoingRequestsNotification |
StorageSyncRequest | 
StorageSyncResponse | 
SubmitMessageRequest |
SubmitMessageResponse
    ;

const EMPTY_ARRAY: Uint8Array[] = [];
const strCodec = createStrToUint8ArrayCodec();

function setToArray<T>(set?: ReadonlySet<T>): T[] | undefined {
	if (!set) return;
	
	return Array.from(set);
}

function arrayToSet<T>(array?: T[]): Set<T> | undefined {
	if (!array) return;
	
	return new Set<T>(array);
}

export class HamokGridCodec implements HamokCodec<Input, HamokMessage> {

	public encode(input: Input): HamokMessage {
		switch (input.constructor) {
			case HelloNotification:
				return this.encodeHelloNotification(input as HelloNotification);
			case JoinNotification:
				return this.encodeJoinNotification(input as JoinNotification);
			case EndpointStatesNotification:
				return this.encodeEndpointStateNotification(input as EndpointStatesNotification);
			case OngoingRequestsNotification:
				return this.encodeOngoingRequestsNotification(input as OngoingRequestsNotification);
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
			case MessageType.HELLO_NOTIFICATION:
				return this.decodeHelloNotification(message);
			case MessageType.JOIN_NOTIFICATION:
				return this.decodeJoinNotification(message);
			case MessageType.ENDPOINT_STATES_NOTIFICATION:
				return this.decodeEndpointStateNotification(message);      
			case MessageType.ONGOING_REQUESTS_NOTIFICATION:
				return this.decodeOngoingRequestsNotification(message);
			case MessageType.SUBMIT_MESSAGE_REQUEST:
				return this.decodeSubmitMessageRequest(message);
			case MessageType.SUBMIT_MESSAGE_RESPONSE:
				return this.decodeSubmitMessageResponse(message);
			default:
				throw new Error(`Cannot decode message${ message}`);
		}
	}

	public encodeHelloNotification(notification: HelloNotification): HamokMessage {
		return new HamokMessage({
			// eslint-disable-next-line camelcase
			protocol: HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL,
			type: MessageType.HELLO_NOTIFICATION,
			sourceId: notification.sourcePeerId,
			destinationId: notification.destinationPeerId,
			raftLeaderId: notification.raftLeaderId,
			keys: notification.customData ? [ strCodec.encode(notification.customData) ] : [],
		});
	}

	public decodeHelloNotification(message: HamokMessage): HelloNotification {
		if (message.type !== MessageType.HELLO_NOTIFICATION) {
			throw new Error('decodeHelloNotification(): Message type must be HELLO_NOTIFICATION');
		}
		const customData = message.values.length === 1 ? strCodec.decode(message.values[0]) : undefined;

		return new HelloNotification(
			message.sourceId!,
			message.destinationId,
			message.raftLeaderId,
			customData
		);
	}

	public encodeJoinNotification(notification: JoinNotification): HamokMessage {
		return new HamokMessage({
			// eslint-disable-next-line camelcase
			protocol: HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL,
			type: MessageType.JOIN_NOTIFICATION,
			sourceId: notification.sourcePeerId,
			destinationId: notification.destinationPeerId,
		});
	}

	public decodeJoinNotification(message: HamokMessage): JoinNotification {
		if (message.type !== MessageType.JOIN_NOTIFICATION) {
			throw new Error('decodeJoinNotification(): Message type must be JOIN_NOTIFICATION');
		}
		
		return new JoinNotification(
			message.sourceId!,
			message.destinationId,
		);
	}

	public encodeEndpointStateNotification(notification: EndpointStatesNotification): HamokMessage {
		const activeEndpointIds = setToArray<string>(notification.activeEndpointIds);
        
		return new HamokMessage({
			// eslint-disable-next-line camelcase
			protocol: HamokMessageProtocol.GRID_COMMUNICATION_PROTOCOL,
			type: MessageType.ENDPOINT_STATES_NOTIFICATION,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
			raftTerm: notification.term,
			raftCommitIndex: notification.commitIndex,
			raftLeaderNextIndex: notification.leaderNextIndex,
			raftNumberOfLogs: notification.numberOfLogs,
			activeEndpointIds,
			values: notification.customData ? [ strCodec.encode(notification.customData) ] : [],
		});
	}

	public decodeEndpointStateNotification(message: HamokMessage): EndpointStatesNotification {
		if (message.type !== MessageType.ENDPOINT_STATES_NOTIFICATION) {
			throw new Error('decodeEndpointStateNotification(): Message type must be ENDPOINT_STATES_NOTIFICATION');
		}
		const activeEndpointIds = arrayToSet<string>(message.activeEndpointIds);
		const customData = message.values.length === 1 ? strCodec.decode(message.values[0]) : undefined;
		
		return new EndpointStatesNotification(
			message.sourceId!,
			message.destinationId!,
			message.raftTerm!,
			message.raftCommitIndex!,
			message.raftLeaderNextIndex!,
			message.raftNumberOfLogs!,
			activeEndpointIds,
			customData
		);
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
