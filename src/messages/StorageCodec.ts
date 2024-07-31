import * as Collections from '../common/Collections';
import { HamokCodec, HamokDecoder, HamokEncoder } from '../common/HamokCodec';
import { UpdateEntriesNotification, UpdateEntriesRequest, UpdateEntriesResponse } from './messagetypes/UpdateEntries';
import { HamokMessage as Message, HamokMessage_MessageType as MessageType } from './HamokMessage';
import { ClearEntriesNotification, ClearEntriesRequest, ClearEntriesResponse } from './messagetypes/ClearEntries';
import { GetEntriesRequest, GetEntriesResponse } from './messagetypes/GetEntries';
import { GetKeysRequest, GetKeysResponse } from './messagetypes/GetKeys';
import { DeleteEntriesNotification, DeleteEntriesRequest, DeleteEntriesResponse } from './messagetypes/DeleteEntries';
import { RemoveEntriesNotification, RemoveEntriesRequest, RemoveEntriesResponse } from './messagetypes/RemoveEntries';
import { EvictEntriesNotification, EvictEntriesRequest, EvictEntriesResponse } from './messagetypes/EvictEntries';
import { InsertEntriesNotification, InsertEntriesRequest, InsertEntriesResponse } from './messagetypes/InsertEntries';
import { GetSizeRequest, GetSizeResponse } from './messagetypes/GetSize';
import { RestoreEntriesNotification, RestoreEntriesRequest, RestoreEntriesResponse } from './messagetypes/RestoreEntries';
import { createLogger } from '../common/logger';

const logger = createLogger('StorageCodec');

const EMPTY_ARRAY: Uint8Array[] = [];

type Input<K, V> = 
    ClearEntriesNotification |
    ClearEntriesRequest |
    ClearEntriesResponse |
    GetEntriesRequest<K> |
    GetEntriesResponse<K, V> |
    GetKeysRequest |
    GetKeysResponse<K> |
    GetSizeRequest |
    GetSizeResponse |
    DeleteEntriesNotification<K> |
    DeleteEntriesRequest<K> |
    DeleteEntriesResponse<K> |
    RemoveEntriesNotification<K> |
    RemoveEntriesRequest<K> |
    RemoveEntriesResponse<K, V> |
    EvictEntriesNotification<K> |
    EvictEntriesRequest<K> |
    EvictEntriesResponse |
    InsertEntriesNotification<K, V> |
    InsertEntriesRequest<K, V> |
    InsertEntriesResponse<K, V> |
    UpdateEntriesNotification<K, V> |
    UpdateEntriesRequest<K, V> |
    UpdateEntriesResponse<K, V>
    ;

export type StorageCodecMessageMap<K, V> = {
	ClearEntriesRequest: ClearEntriesRequest;
	ClearEntriesResponse: ClearEntriesResponse;
	ClearEntriesNotification: ClearEntriesNotification;
	GetEntriesRequest: GetEntriesRequest<K>;
	GetEntriesResponse: GetEntriesResponse<K, V>;
	GetKeysRequest: GetKeysRequest;
	GetKeysResponse: GetKeysResponse<K>;
	GetSizeRequest: GetSizeRequest;
	GetSizeResponse: GetSizeResponse;
	DeleteEntriesRequest: DeleteEntriesRequest<K>;
	DeleteEntriesResponse: DeleteEntriesResponse<K>;
	DeleteEntriesNotification: DeleteEntriesNotification<K>;
	RemoveEntriesRequest: RemoveEntriesRequest<K>;
	RemoveEntriesResponse: RemoveEntriesResponse<K, V>;
	RemoveEntriesNotification: RemoveEntriesNotification<K>;
	EvictEntriesRequest: EvictEntriesRequest<K>;
	EvictEntriesResponse: EvictEntriesResponse;
	EvictEntriesNotification: EvictEntriesNotification<K>;
	InsertEntriesRequest: InsertEntriesRequest<K, V>;
	InsertEntriesResponse: InsertEntriesResponse<K, V>;
	InsertEntriesNotification: InsertEntriesNotification<K, V>;
	UpdateEntriesRequest: UpdateEntriesRequest<K, V>;
	UpdateEntriesResponse: UpdateEntriesResponse<K, V>;
	UpdateEntriesNotification: UpdateEntriesNotification<K, V>;
	RestoreEntriesRequest: RestoreEntriesRequest<K, V>;
	RestoreEntriesResponse: RestoreEntriesResponse;
	RestoreEntriesNotification: RestoreEntriesNotification<K, V>;
}

export class StorageCodec<K, V> implements HamokCodec<Input<K, V>, Message> {

	public constructor(
		public readonly keyCodec: HamokCodec<K, Uint8Array>,
		public readonly valueCodec: HamokCodec<V, Uint8Array>,
	) {
		// empty
	}

	encode(input: Input<K, V>, callback?: <U extends keyof StorageCodecMessageMap<K, V>>(type: U, message: Message) => void): Message {
		let result: Message;

		switch (input.constructor) {
			case ClearEntriesRequest:
				result = this.encodeClearEntriesRequest(input as ClearEntriesRequest);
				break;
			case ClearEntriesResponse:
				result = this.encodeClearEntriesResponse(input as ClearEntriesResponse);
				break;
			case ClearEntriesNotification:
				result = this.encodeClearEntriesNotification(input as ClearEntriesNotification);
				break;

			case GetEntriesRequest:
				result = this.encodeGetEntriesRequest(input as GetEntriesRequest<K>);
				break;
			case GetEntriesResponse:
				result = this.encodeGetEntriesResponse(input as GetEntriesResponse<K, V>);
				break;
   
			case GetKeysRequest:
				result = this.encodeGetKeysRequest(input as GetKeysRequest);
				break;
			case GetKeysResponse:
				result = this.encodeGetKeysResponse(input as GetKeysResponse<K>);
				break;

			case GetSizeRequest:
				result = this.encodeGetSizeRequest(input as GetSizeRequest);
				break;
			case GetSizeResponse:
				result = this.encodeGetSizeResponse(input as GetSizeResponse);
				break;

			case DeleteEntriesRequest:
				result = this.encodeDeleteEntriesRequest(input as DeleteEntriesRequest<K>);
				break;
			case DeleteEntriesResponse:
				result = this.encodeDeleteEntriesResponse(input as DeleteEntriesResponse<K>);
				break;
			case DeleteEntriesNotification:
				result = this.encodeDeleteEntriesNotification(input as DeleteEntriesNotification<K>);
				break;

			case RemoveEntriesRequest:
				result = this.encodeRemoveEntriesRequest(input as RemoveEntriesRequest<K>);
				break;
			case RemoveEntriesResponse:
				result = this.encodeRemoveEntriesResponse(input as RemoveEntriesResponse<K, V>);
				break;
			case RemoveEntriesNotification:
				result = this.encodeDeleteEntriesNotification(input as RemoveEntriesNotification<K>);
				break;

			case EvictEntriesRequest:
				result = this.encodeEvictEntriesRequest(input as EvictEntriesRequest<K>);
				break;
			case EvictEntriesResponse:
				result = this.encodeEvictEntriesResponse(input as EvictEntriesResponse);
				break;
			case EvictEntriesNotification:
				result = this.encodeRemoveEntriesNotification(input as EvictEntriesNotification<K>);
				break;
                
			case InsertEntriesRequest:
				result = this.encodeInsertEntriesRequest(input as InsertEntriesRequest<K, V>);
				break;
			case InsertEntriesResponse:
				result = this.encodeInsertEntriesResponse(input as InsertEntriesResponse<K, V>);
				break;
			case InsertEntriesNotification:
				result = this.encodeInsertEntriesNotification(input as InsertEntriesNotification<K, V>);
				break;

			case UpdateEntriesRequest:
				result = this.encodeUpdateEntriesRequest(input as UpdateEntriesRequest<K, V>);
				break;
			case UpdateEntriesResponse:
				result = this.encodeUpdateEntriesResponse(input as UpdateEntriesResponse<K, V>);
				break;
			case UpdateEntriesNotification:
				result = this.encodeUpdateEntriesNotification(input as UpdateEntriesNotification<K, V>);
				break;

			case RestoreEntriesRequest:
				result = this.encodeRestoreEntriesRequest(input as RestoreEntriesRequest<K, V>);
				break;
			case RestoreEntriesResponse:
				result = this.encodeRestoreEntriesResponse(input as RestoreEntriesResponse);
				break;
			case RestoreEntriesNotification:
				result = this.encodeRestoreEntriesNotification(input as RestoreEntriesNotification<K, V>);
				break;
			default:
				throw new Error(`Cannot encode input${ input}`);

		}

		logger.trace('Encoded message %o', input);
		
		if (callback) {
			callback(input.constructor.name as keyof StorageCodecMessageMap<K, V>, result);
		}
		
		return result;
	}

	decode(message: Message, callback?: <U extends keyof StorageCodecMessageMap<K, V>>(type: U, output: StorageCodecMessageMap<K, V>[U]) => void): Input<K, V> {
		let type: keyof StorageCodecMessageMap<K, V> | undefined;
		let result: Input<K, V> | undefined;

		switch (message.type) {
			case MessageType.CLEAR_ENTRIES_REQUEST:
				type = callback ? 'ClearEntriesRequest' : undefined;
				result = this.decodeClearEntriesRequest(message);
				break;
			case MessageType.CLEAR_ENTRIES_RESPONSE:
				type = callback ? 'ClearEntriesResponse' : undefined;
				result = this.decodeClearEntriesResponse(message);
				break;
			case MessageType.CLEAR_ENTRIES_NOTIFICATION:
				type = callback ? 'ClearEntriesNotification' : undefined;
				result = this.decodeClearEntriesNotification(message);
				break;
			case MessageType.GET_ENTRIES_REQUEST:
				type = callback ? 'GetEntriesRequest' : undefined;
				result = this.decodeGetEntriesRequest(message);
				break;
			case MessageType.GET_ENTRIES_RESPONSE:
				type = callback ? 'GetEntriesResponse' : undefined;
				result = this.decodeGetEntriesResponse(message);
				break;
			case MessageType.GET_SIZE_REQUEST:
				type = callback ? 'GetSizeRequest' : undefined;
				result = this.decodeGetSizeRequest(message);
				break;
			case MessageType.GET_SIZE_RESPONSE:
				type = callback ? 'GetSizeResponse' : undefined;
				result = this.decodeGetSizeResponse(message);
				break;
			case MessageType.GET_KEYS_REQUEST:
				type = callback ? 'GetKeysRequest' : undefined;
				result = this.decodeGetKeysRequest(message);
				break;
			case MessageType.GET_KEYS_RESPONSE:
				type = callback ? 'GetKeysResponse' : undefined;
				result = this.decodeGetKeysResponse(message);
				break;
			case MessageType.DELETE_ENTRIES_REQUEST:
				type = callback ? 'DeleteEntriesRequest' : undefined;
				result = this.decodeDeleteEntriesRequest(message);
				break;
			case MessageType.DELETE_ENTRIES_RESPONSE:
				type = callback ? 'DeleteEntriesResponse' : undefined;
				result = this.decodeDeleteEntriesResponse(message);
				break;
			case MessageType.DELETE_ENTRIES_NOTIFICATION:
				type = callback ? 'DeleteEntriesNotification' : undefined;
				result = this.decodeDeleteEntriesNotification(message);
				break;
			case MessageType.REMOVE_ENTRIES_REQUEST:
				type = callback ? 'RemoveEntriesRequest' : undefined;
				result = this.decodeRemoveEntriesRequest(message);
				break;
			case MessageType.REMOVE_ENTRIES_RESPONSE:
				type = callback ? 'RemoveEntriesResponse' : undefined;
				result = this.decodeRemoveEntriesResponse(message);
				break;
			case MessageType.REMOVE_ENTRIES_NOTIFICATION:
				type = callback ? 'RemoveEntriesNotification' : undefined;
				result = this.decodeRemoveEntriesNotification(message);
				break;
			case MessageType.EVICT_ENTRIES_REQUEST:
				type = callback ? 'EvictEntriesRequest' : undefined;
				result = this.decodeEvictEntriesRequest(message);
				break;
			case MessageType.EVICT_ENTRIES_RESPONSE:
				type = callback ? 'EvictEntriesResponse' : undefined;
				result = this.decodeEvictEntriesResponse(message);
				break;
			case MessageType.EVICT_ENTRIES_NOTIFICATION:
				type = callback ? 'EvictEntriesNotification' : undefined;
				result = this.decodeEvictEntriesNotification(message);
				break;
			case MessageType.INSERT_ENTRIES_REQUEST:
				type = callback ? 'InsertEntriesRequest' : undefined;
				result = this.decodeInsertEntriesRequest(message);
				break;
			case MessageType.INSERT_ENTRIES_RESPONSE:
				type = callback ? 'InsertEntriesResponse' : undefined;
				result = this.decodeInsertEntriesResponse(message);
				break;
			case MessageType.INSERT_ENTRIES_NOTIFICATION:
				type = callback ? 'InsertEntriesNotification' : undefined;
				result = this.decodeInsertEntriesNotification(message);
				break;
			case MessageType.UPDATE_ENTRIES_REQUEST:
				type = callback ? 'UpdateEntriesRequest' : undefined;
				result = this.decodeUpdateEntriesRequest(message);
				break;
			case MessageType.UPDATE_ENTRIES_RESPONSE:
				type = callback ? 'UpdateEntriesResponse' : undefined;
				result = this.decodeUpdateEntriesResponse(message);
				break;
			case MessageType.UPDATE_ENTRIES_NOTIFICATION:
				type = callback ? 'UpdateEntriesNotification' : undefined;
				result = this.decodeUpdateEntriesNotification(message);
				break;
			case MessageType.RESTORE_ENTRIES_REQUEST:
				type = callback ? 'RestoreEntriesRequest' : undefined;
				result = this.decodeRestoreEntriesRequest(message);
				break;
			case MessageType.RESTORE_ENTRIES_RESPONSE:
				type = callback ? 'RestoreEntriesResponse' : undefined;
				result = this.decodeRestoreEntriesResponse(message);
				break;
			case MessageType.RESTORE_ENTRIES_NOTIFICATION:
				type = callback ? 'RestoreEntriesNotification' : undefined;
				result = this.decodeRestoreEntriesNotification(message);
				break;
		}

		logger.trace('Decoded message %o', message);

		if (!result) {
			throw new Error(`Cannot decode message ${message.type}`);
		}
		if (type && callback) {
			callback(type, result);
		}
		
		return result;
	}

	public encodeClearEntriesRequest(request: ClearEntriesRequest): Message {
		return new Message({
			type: MessageType.CLEAR_ENTRIES_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId,
		});
	}

	public decodeClearEntriesRequest(message: Message): ClearEntriesRequest {
		if (message.type !== MessageType.CLEAR_ENTRIES_REQUEST) {
			throw new Error('decodeClearEntriesRequest(): Message type must be CLEAR_ENTRIES_REQUEST');
		}
		
		return new ClearEntriesRequest(
			message.requestId!,
			message.sourceId,
		);
	}
    
	public encodeClearEntriesResponse(response: ClearEntriesResponse): Message {
		return new Message({
			type: MessageType.CLEAR_ENTRIES_RESPONSE,
			requestId: response.requestId,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeClearEntriesResponse(message: Message): ClearEntriesResponse {
		if (message.type !== MessageType.CLEAR_ENTRIES_RESPONSE) {
			throw new Error('decodeClearEntriesResponse(): Message type must be CLEAR_ENTRIES_RESPONSE');
		}
		
		return new ClearEntriesResponse(
			message.requestId!,
			message.destinationId,
		);
	}

	public encodeClearEntriesNotification(notification: ClearEntriesNotification): Message {
		return new Message({
			type: MessageType.CLEAR_ENTRIES_NOTIFICATION,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeClearEntriesNotification(message: Message): ClearEntriesNotification {
		if (message.type !== MessageType.CLEAR_ENTRIES_NOTIFICATION) {
			throw new Error('decodeClearEntriesNotification(): Message type must be CLEAR_ENTRIES_NOTIFICATION');
		}
		
		return new ClearEntriesNotification(
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeGetEntriesRequest(request: GetEntriesRequest<K>): Message {
		const keys = this._encodeKeys(request.keys);
        
		return new Message({
			type: MessageType.GET_ENTRIES_REQUEST,
			requestId: request.requestId,
			keys,
			sourceId: request.sourceEndpointId,
		});
	}

	public decodeGetEntriesRequest(message: Message): GetEntriesRequest<K> {
		if (message.type !== MessageType.GET_ENTRIES_REQUEST) {
			throw new Error('decodeGetEntriesRequest(): Message type must be GET_ENTRIES_REQUEST');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new GetEntriesRequest<K>(
			keys,
			message.requestId!,
			message.sourceId,
		);
	}

	public encodeGetEntriesResponse(response: GetEntriesResponse<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(response.foundEntries);
        
		return new Message({
			type: MessageType.GET_ENTRIES_RESPONSE,
			requestId: response.requestId,
			keys,
			values,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeGetEntriesResponse(message: Message): GetEntriesResponse<K, V> {
		if (message.type !== MessageType.GET_ENTRIES_RESPONSE) {
			throw new Error('decodeGetEntriesResponse(): Message type must be GET_ENTRIES_RESPONSE');
		}
		const foundEntries = this._decodeEntries(message.keys, message.values);
        
		return new GetEntriesResponse<K, V>(
			message.requestId!,
			foundEntries,
			message.destinationId,
		);
	}

	public encodeGetSizeRequest(request: GetSizeRequest): Message {
		return new Message({
			type: MessageType.GET_SIZE_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId
		});
	}

	public decodeGetSizeRequest(message: Message): GetSizeRequest {
		if (message.type !== MessageType.GET_SIZE_REQUEST) {
			throw new Error('decodeGetSizeRequest(): Message type must be GET_SIZE_REQUEST');
		}
		
		return new GetSizeRequest(
			message.requestId!,
			message.sourceId,
		);
	}
    
	public encodeGetSizeResponse(response: GetSizeResponse): Message {
		return new Message({
			type: MessageType.GET_SIZE_RESPONSE,
			requestId: response.requestId,
			storageSize: response.size,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeGetSizeResponse(message: Message): GetSizeResponse {
		if (message.type !== MessageType.GET_SIZE_RESPONSE) {
			throw new Error('decodeGetSizeResponse(): Message type must be GET_SIZE_RESPONSE');
		}
		
		return new GetSizeResponse(
			message.requestId!,
			message.storageSize!,
			message.destinationId,
		);
	}

	public encodeGetKeysRequest(request: GetKeysRequest): Message {
		return new Message({
			type: MessageType.GET_KEYS_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId
		});
	}

	public decodeGetKeysRequest(message: Message): GetKeysRequest {
		if (message.type !== MessageType.GET_KEYS_REQUEST) {
			throw new Error('decodeGetKeysRequest(): Message type must be GET_KEYS_REQUEST');
		}
		
		return new GetKeysRequest(
			message.requestId!,
			message.sourceId,
		);
	}
    
	public encodeGetKeysResponse(response: GetKeysResponse<K>): Message {
		const keys = this._encodeKeys(response.keys);
        
		return new Message({
			type: MessageType.GET_KEYS_RESPONSE,
			requestId: response.requestId,
			destinationId: response.destinationEndpointId,
			keys
		});
	}

	public decodeGetKeysResponse(message: Message): GetKeysResponse<K> {
		if (message.type !== MessageType.GET_KEYS_RESPONSE) {
			throw new Error('decodeGetKeysResponse(): Message type must be GET_ENTRIES_RESPONSE');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new GetKeysResponse<K>(
			message.requestId!,
			keys,
			message.destinationId,
		);
	}

	public encodeDeleteEntriesRequest(request: DeleteEntriesRequest<K>): Message {
		const keys = this._encodeKeys(request.keys);
        
		return new Message({
			type: MessageType.DELETE_ENTRIES_REQUEST,
			requestId: request.requestId,
			keys,
			sourceId: request.sourceEndpointId
		});
	}

	public decodeDeleteEntriesRequest(message: Message): DeleteEntriesRequest<K> {
		if (message.type !== MessageType.DELETE_ENTRIES_REQUEST) {
			throw new Error('decodeDeleteEntriesRequest(): Message type must be DELETE_ENTRIES_REQUEST');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new DeleteEntriesRequest<K>(
			message.requestId!,
			keys,
			message.sourceId,
		);
	}
    
	public encodeDeleteEntriesResponse(response: DeleteEntriesResponse<K>): Message {
		const keys = this._encodeKeys(response.deletedKeys);
        
		return new Message({
			type: MessageType.DELETE_ENTRIES_RESPONSE,
			requestId: response.requestId,
			keys,
			destinationId: response.destinationEndpointId
		});
	}

	public decodeDeleteEntriesResponse(message: Message): DeleteEntriesResponse<K> {
		if (message.type !== MessageType.DELETE_ENTRIES_RESPONSE) {
			throw new Error('decodeDeleteEntriesResponse(): Message type must be DELETE_ENTRIES_RESPONSE');
		}
		const deletedKeys = this._decodeKeys(message.keys);
        
		return new DeleteEntriesResponse<K>(
			message.requestId!,
			deletedKeys,
			message.destinationId,
		);
	}

	public encodeDeleteEntriesNotification(notification: DeleteEntriesNotification<K>): Message {
		const keys = this._encodeKeys(notification.keys);
        
		return new Message({
			type: MessageType.DELETE_ENTRIES_NOTIFICATION,
			keys,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId
		});
	}

	public decodeDeleteEntriesNotification(message: Message): DeleteEntriesNotification<K> {
		if (message.type !== MessageType.DELETE_ENTRIES_NOTIFICATION) {
			throw new Error('decodeDeleteNotification(): Message type must be DELETE_ENTRIES_NOTIFICATION');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new DeleteEntriesNotification<K>(
			keys,
			message.sourceId,
			message.destinationId,
		);
	}
    
	public encodeRemoveEntriesRequest(request: RemoveEntriesRequest<K>): Message {
		const keys = this._encodeKeys(request.keys);
        
		return new Message({
			type: MessageType.REMOVE_ENTRIES_REQUEST,
			requestId: request.requestId,
			keys,
			sourceId: request.sourceEndpointId
		});
	}

	public decodeRemoveEntriesRequest(message: Message): RemoveEntriesRequest<K> {
		if (message.type !== MessageType.REMOVE_ENTRIES_REQUEST) {
			throw new Error('decodeRemoveRequest(): Message type must be REMOVE_ENTRIES_REQUEST');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new RemoveEntriesRequest<K>(
			message.requestId!,
			keys,
			message.sourceId,
		);
	}
    
	public encodeRemoveEntriesResponse(response: RemoveEntriesResponse<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(response.removedEntries);
        
		return new Message({
			type: MessageType.REMOVE_ENTRIES_RESPONSE,
			requestId: response.requestId,
			keys,
			values,
			destinationId: response.destinationEndpointId
		});
	}

	public decodeRemoveEntriesResponse(message: Message): RemoveEntriesResponse<K, V> {
		if (message.type !== MessageType.REMOVE_ENTRIES_RESPONSE) {
			throw new Error('decodeRemoveResponse(): Message type must be REMOVE_ENTRIES_RESPONSE');
		}
		const removedEntries = this._decodeEntries(message.keys, message.values);
        
		return new RemoveEntriesResponse<K, V>(
			message.requestId!,
			removedEntries,
			message.destinationId,
		);
	}

	public encodeRemoveEntriesNotification(notification: RemoveEntriesNotification<K>): Message {
		const keys = this._encodeKeys(notification.keys);
        
		return new Message({
			type: MessageType.REMOVE_ENTRIES_NOTIFICATION,
			keys,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId
		});
	}

	public decodeRemoveEntriesNotification(message: Message): RemoveEntriesNotification<K> {
		if (message.type !== MessageType.REMOVE_ENTRIES_NOTIFICATION) {
			throw new Error('decodeRemoveNotification(): Message type must be REMOVE_ENTRIES_NOTIFICATION');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new RemoveEntriesNotification<K>(
			keys,
			message.sourceId,
			message.destinationId,
		);
	}
    
	public encodeEvictEntriesRequest(request: EvictEntriesRequest<K>): Message {
		const keys = this._encodeKeys(request.keys);
        
		return new Message({
			type: MessageType.EVICT_ENTRIES_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId,
			keys,
		});
	}

	public decodeEvictEntriesRequest(message: Message): EvictEntriesRequest<K> {
		if (message.type !== MessageType.EVICT_ENTRIES_REQUEST) {
			throw new Error('decodeEvictRequest(): Message type must be EVICT_ENTRIES_REQUEST');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new EvictEntriesRequest<K>(
			message.requestId!,
			keys,
			message.sourceId,
		);
	}
    
	public encodeEvictEntriesResponse(response: EvictEntriesResponse): Message {
		return new Message({
			type: MessageType.EVICT_ENTRIES_RESPONSE,
			requestId: response.requestId,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeEvictEntriesResponse(message: Message): EvictEntriesResponse {
		if (message.type !== MessageType.EVICT_ENTRIES_RESPONSE) {
			throw new Error('decodeEvictResponse(): Message type must be EVICT_ENTRIES_RESPONSE');
		}
		
		return new EvictEntriesResponse(
			message.requestId!,
			message.destinationId,
		);
	}

	public encodeEvictEntriesNotification(notification: EvictEntriesNotification<K>): Message {
		const keys = this._encodeKeys(notification.keys);
        
		return new Message({
			type: MessageType.EVICT_ENTRIES_NOTIFICATION,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
			keys,
		});
	}

	public decodeEvictEntriesNotification(message: Message): EvictEntriesNotification<K> {
		if (message.type !== MessageType.EVICT_ENTRIES_NOTIFICATION) {
			throw new Error('decodeEvictNotification(): Message type must be EVICT_ENTRIES_NOTIFICATION');
		}
		const keys = this._decodeKeys(message.keys);
        
		return new EvictEntriesNotification<K>(
			keys,
			message.sourceId,
			message.destinationId
		);
	}

	public encodeInsertEntriesRequest(request: InsertEntriesRequest<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(request.entries);
        
		return new Message({
			type: MessageType.INSERT_ENTRIES_REQUEST,
			requestId: request.requestId,
			keys,
			values,
			sourceId: request.sourceEndpointId
		});
	}

	public decodeInsertEntriesRequest(message: Message): InsertEntriesRequest<K, V> {
		if (message.type !== MessageType.INSERT_ENTRIES_REQUEST) {
			throw new Error('decodeInsertRequest(): Message type must be INSERT_ENTRIES_REQUEST');
		}
		const entries = this._decodeEntries(message.keys, message.values);
        
		return new InsertEntriesRequest<K, V>(
			message.requestId!,
			entries,
			message.sourceId,
		);
	}
    
	public encodeInsertEntriesResponse(response: InsertEntriesResponse<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(response.existingEntries);
        
		return new Message({
			type: MessageType.INSERT_ENTRIES_RESPONSE,
			requestId: response.requestId,
			keys,
			values,
			destinationId: response.destinationEndpointId
		});
	}

	public decodeInsertEntriesResponse(message: Message): InsertEntriesResponse<K, V> {
		if (message.type !== MessageType.INSERT_ENTRIES_RESPONSE) {
			throw new Error('decodeInsertResponse(): Message type must be INSERT_ENTRIES_RESPONSE');
		}
		const entries = this._decodeEntries(message.keys, message.values);
        
		return new InsertEntriesResponse<K, V>(
			message.requestId!,
			entries,
			message.destinationId,
		);
	}

	public encodeInsertEntriesNotification(notification: InsertEntriesNotification<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(notification.entries);
        
		return new Message({
			type: MessageType.INSERT_ENTRIES_NOTIFICATION,
			sourceId: notification.sourceEndpointId,
			keys,
			values,
			destinationId: notification.destinationEndpointId
		});
	}

	public decodeInsertEntriesNotification(message: Message): InsertEntriesNotification<K, V> {
		if (message.type !== MessageType.INSERT_ENTRIES_NOTIFICATION) {
			throw new Error('decodeInsertNotification(): Message type must be INSERT_ENTRIES_NOTIFICATION');
		}
		const entries = this._decodeEntries(message.keys, message.values);
        
		return new InsertEntriesNotification<K, V>(
			entries,
			message.sourceId,
			message.destinationId
		);
	}

	public encodeUpdateEntriesRequest(request: UpdateEntriesRequest<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(request.entries);
        
		return new Message({
			type: MessageType.UPDATE_ENTRIES_REQUEST,
			sourceId: request.sourceEndpointId,
			requestId: request.requestId,
			keys,
			values,
		});
	}

	public decodeUpdateEntriesRequest(message: Message): UpdateEntriesRequest<K, V> {
		if (message.type !== MessageType.UPDATE_ENTRIES_REQUEST) {
			throw new Error('decodeUpdateEntriesRequest(): Message type must be UPDATE_ENTRIES_REQUEST');
		}
		const entries = this._decodeEntries(message.keys, message.values);
        
		return new UpdateEntriesRequest<K, V>(
			message.requestId!,
			entries,
			message.sourceId,
		);
	}
    
	public encodeUpdateEntriesResponse(response: UpdateEntriesResponse<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(response.updatedEntries);
        
		return new Message({
			type: MessageType.UPDATE_ENTRIES_RESPONSE,
			requestId: response.requestId,
			keys,
			values,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeUpdateEntriesResponse(message: Message): UpdateEntriesResponse<K, V> {
		if (message.type !== MessageType.UPDATE_ENTRIES_RESPONSE) {
			throw new Error('decodeUpdateEntriesResponse(): Message type must be UPDATE_ENTRIES_RESPONSE');
		}
		const updatedEntries = this._decodeEntries(message.keys, message.values);
        
		return new UpdateEntriesResponse<K, V>(
			message.requestId!,
			updatedEntries,
			message.destinationId,
		);
	}

	public encodeUpdateEntriesNotification(notification: UpdateEntriesNotification<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(notification.updatedEntries);
        
		return new Message({
			type: MessageType.UPDATE_ENTRIES_NOTIFICATION,
			keys,
			values,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeUpdateEntriesNotification(message: Message): UpdateEntriesNotification<K, V> {
		if (message.type !== MessageType.UPDATE_ENTRIES_NOTIFICATION) {
			throw new Error('decodeUpdateEntriesResponse(): Message type must be UPDATE_ENTRIES_RESPONSE');
		}
		const updatedEntries = this._decodeEntries(message.keys, message.values);
        
		return new UpdateEntriesNotification<K, V>(
			updatedEntries,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeRestoreEntriesRequest(request: RestoreEntriesRequest<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(request.entries);
        
		return new Message({
			type: MessageType.RESTORE_ENTRIES_REQUEST,
			sourceId: request.sourceEndpointId,
			requestId: request.requestId,
			keys,
			values,
		});
	}

	public decodeRestoreEntriesRequest(message: Message): RestoreEntriesRequest<K, V> {
		if (message.type !== MessageType.RESTORE_ENTRIES_REQUEST) {
			throw new Error('decodeRestoreEntriesRequest(): Message type must be RESTORE_ENTRIES_REQUEST');
		}
		const entries = this._decodeEntries(message.keys, message.values);
        
		return new RestoreEntriesRequest<K, V>(
			message.requestId!,
			entries,
			message.sourceId,
		);
	}
    
	public encodeRestoreEntriesResponse(response: RestoreEntriesResponse): Message {
		return new Message({
			type: MessageType.RESTORE_ENTRIES_RESPONSE,
			requestId: response.requestId,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeRestoreEntriesResponse(message: Message): RestoreEntriesResponse {
		if (message.type !== MessageType.RESTORE_ENTRIES_RESPONSE) {
			throw new Error('decodeRestoreEntriesResponse(): Message type must be RESTORE_ENTRIES_RESPONSE');
		}
		
		return new RestoreEntriesResponse(
			message.requestId!,
			message.destinationId,
		);
	}

	public encodeRestoreEntriesNotification(notification: RestoreEntriesNotification<K, V>): Message {
		const [ keys, values ] = this._encodeEntries(notification.entries);
        
		return new Message({
			type: MessageType.RESTORE_ENTRIES_NOTIFICATION,
			keys,
			values,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeRestoreEntriesNotification(message: Message): RestoreEntriesNotification<K, V> {
		if (message.type !== MessageType.RESTORE_ENTRIES_NOTIFICATION) {
			throw new Error('decodeRestoreEntriesResponse(): Message type must be RESTORE_ENTRIES_RESPONSE');
		}
		const restoredEntries = this._decodeEntries(message.keys, message.values);
        
		return new RestoreEntriesNotification<K, V>(
			restoredEntries,
			message.sourceId,
			message.destinationId,
		);
	}

	private _encodeKeys(keys: ReadonlySet<K>): Uint8Array[] {
		return StorageCodec._encodeSet<K>(keys, this.keyCodec);
	}

	private _decodeKeys(keys: Uint8Array[]): ReadonlySet<K> {
		return StorageCodec._decodeSet<K>(keys, this.keyCodec);
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

	private _encodeEntries(entries: ReadonlyMap<K, V>): [Uint8Array[], Uint8Array[]] {
		if (entries.size < 1) {
			return [ [], [] ];
		}
		const encodedKeys: Uint8Array[] = [];
		const encodedValues: Uint8Array[] = [];

		for (const [ key, value ] of entries) {
			const encodedKey = this.keyCodec.encode(key);
			const encodedValue = this.valueCodec.encode(value);

			encodedKeys.push(encodedKey);
			encodedValues.push(encodedValue);
		}
		
		return [ encodedKeys, encodedValues ];
	}

	private _decodeEntries(keys: Uint8Array[], values: Uint8Array[]): ReadonlyMap<K, V> {
		if (keys.length < 1 || values.length < 1) {
			return Collections.EMPTY_MAP;
		}
		const result = new Map<K, V>();
		const length = Math.min(keys.length, values.length);

		for (let i = 0; i < length; ++i) {
			const key = keys[i];
			const value = values[i];
			const decodedKey = this.keyCodec.decode(key);
			const decodedValue = this.valueCodec.decode(value);

			result.set(decodedKey, decodedValue);
		}
		
		return result;
	}
    
}