import { HamokCodec, encodeMap, decodeMap, encodeSet, decodeSet, createStrToUint8ArrayCodec } from '../common/HamokCodec';
import { EntryUpdatedNotification, UpdateEntriesNotification, UpdateEntriesRequest, UpdateEntriesResponse } from './messagetypes/UpdateEntries';
import { HamokMessage as Message, HamokMessage_MessageType as MessageType } from './HamokMessage';
import { ClearEntriesNotification, ClearEntriesRequest, ClearEntriesResponse } from './messagetypes/ClearEntries';
import { GetEntriesRequest, GetEntriesResponse } from './messagetypes/GetEntries';
import { GetKeysRequest, GetKeysResponse } from './messagetypes/GetKeys';
import { DeleteEntriesNotification, DeleteEntriesRequest, DeleteEntriesResponse } from './messagetypes/DeleteEntries';
import { EntriesRemovedNotification, RemoveEntriesNotification, RemoveEntriesRequest, RemoveEntriesResponse } from './messagetypes/RemoveEntries';
import { EntriesInsertedNotification, InsertEntriesNotification, InsertEntriesRequest, InsertEntriesResponse } from './messagetypes/InsertEntries';
import { GetSizeRequest, GetSizeResponse } from './messagetypes/GetSize';
import { createLogger } from '../common/logger';
import { StorageAppliedCommitNotification } from './messagetypes/StorageAppliedCommit';
import { StorageHelloNotification } from './messagetypes/StorageHelloNotification';
import { StorageStateNotification } from './messagetypes/StorageStateNotification';

const logger = createLogger('StorageCodec');

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
    EntriesRemovedNotification<K, V> |
    InsertEntriesNotification<K, V> |
    InsertEntriesRequest<K, V> |
    InsertEntriesResponse<K, V> |
    EntriesInsertedNotification<K, V> |
    UpdateEntriesNotification<K, V> |
    UpdateEntriesRequest<K, V> |
    UpdateEntriesResponse<K, V> | 
    EntryUpdatedNotification<K, V> |
    StorageAppliedCommitNotification |
    StorageHelloNotification |
    StorageStateNotification 
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
	EntriesRemovedNotification: EntriesRemovedNotification<K, V>;
	InsertEntriesRequest: InsertEntriesRequest<K, V>;
	InsertEntriesResponse: InsertEntriesResponse<K, V>;
	InsertEntriesNotification: InsertEntriesNotification<K, V>;
	EntriesInsertedNotification: EntriesInsertedNotification<K, V>;
	UpdateEntriesRequest: UpdateEntriesRequest<K, V>;
	UpdateEntriesResponse: UpdateEntriesResponse<K, V>;
	UpdateEntriesNotification: UpdateEntriesNotification<K, V>;
	EntryUpdatedNotification: EntryUpdatedNotification<K, V>;
	StorageAppliedCommitNotification: StorageAppliedCommitNotification;
	StorageHelloNotification: StorageHelloNotification;
	StorageStateNotification: StorageStateNotification;
}

export class StorageCodec<K, V> implements HamokCodec<Input<K, V>, Message> {

	private static readonly strCodec = createStrToUint8ArrayCodec();

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
			case EntriesRemovedNotification:
				result = this.encodeEntriesRemovedNotification(input as EntriesRemovedNotification<K, V>);
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
			case EntriesInsertedNotification:
				result = this.encodeEntriesInsertedNotification(input as EntriesInsertedNotification<K, V>);
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
			case EntryUpdatedNotification:
				result = this.encodeEntryUpdatedNotification(input as EntryUpdatedNotification<K, V>);
				break;

			case StorageAppliedCommitNotification:
				result = this.encodeStorageAppliedCommitNotification(input as StorageAppliedCommitNotification);
				break;

			case StorageHelloNotification:
				result = this.encodeStorageHelloNotification(input as StorageHelloNotification);
				break;
			
			case StorageStateNotification:
				result = this.encodeStorageStateNotification(input as StorageStateNotification);
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
			case MessageType.ENTRIES_REMOVED_NOTIFICATION:
				type = callback ? 'EntriesRemovedNotification' : undefined;
				result = this.decodeEntriesRemovedNotification(message);
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
			case MessageType.ENTRIES_INSERTED_NOTIFICATION:
				type = callback ? 'EntriesInsertedNotification' : undefined;
				result = this.decodeEntriesInsertedNotification(message);
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
			case MessageType.ENTRY_UPDATED_NOTIFICATION:
				type = callback ? 'EntryUpdatedNotification' : undefined;
				result = this.decodeEntryUpdatedNotification(message);
				break;
			case MessageType.STORAGE_APPLIED_COMMIT_NOTIFICATION:
				type = callback ? 'StorageAppliedCommitNotification' : undefined;
				result = this.decodeStorageAppliedCommitNotification(message);
				break;
			case MessageType.STORAGE_HELLO_NOTIFICATION:
				type = callback ? 'StorageHelloNotification' : undefined;
				result = this.decodeStorageHelloNotification(message);
				break;
			case MessageType.STORAGE_STATE_NOTIFICATION:
				type = callback ? 'StorageStateNotification' : undefined;
				result = this.decodeStorageStateNotification(message);
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

	public encodeStorageHelloNotification(notification: StorageHelloNotification): Message {
		return new Message({
			type: MessageType.STORAGE_HELLO_NOTIFICATION,
			sourceId: notification.sourceEndpointId,
		});
	}

	public decodeStorageHelloNotification(message: Message): StorageHelloNotification {
		if (message.type !== MessageType.STORAGE_HELLO_NOTIFICATION) {
			throw new Error('decodeStorageCreatedNotification(): Message type must be STORAGE_HELLO_NOTIFICATION');
		}
		
		return new StorageHelloNotification(
			message.sourceId!,
		);
	}

	public encodeStorageStateNotification(storageState: StorageStateNotification): Message {
		return new Message({
			type: MessageType.STORAGE_STATE_NOTIFICATION,
			sourceId: storageState.sourceEndpointId,
			snapshot: storageState.serializedStorageSnapshot ? StorageCodec.strCodec.encode(storageState.serializedStorageSnapshot) : undefined,
			raftCommitIndex: storageState.commitIndex,
		});
	}

	public decodeStorageStateNotification(message: Message): StorageStateNotification {
		if (message.type !== MessageType.STORAGE_STATE_NOTIFICATION) {
			throw new Error('decodeStorageSnapshot(): Message type must be STORAGE_STATE_NOTIFICATION');
		}
		
		return new StorageStateNotification(
			message.sourceId!,
			message.raftCommitIndex!,
			message.snapshot ? StorageCodec.strCodec.decode(message.snapshot) : undefined,
		);
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
		const keys = this.encodeKeys(request.keys);
        
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
		const keys = this.decodeKeys(message.keys);
        
		return new GetEntriesRequest<K>(
			keys,
			message.requestId!,
			message.sourceId,
		);
	}

	public encodeGetEntriesResponse(response: GetEntriesResponse<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(response.foundEntries);
        
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
		const foundEntries = this.decodeEntries(message.keys, message.values);
        
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
		const keys = this.encodeKeys(response.keys);
        
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
		const keys = this.decodeKeys(message.keys);
        
		return new GetKeysResponse<K>(
			message.requestId!,
			keys,
			message.destinationId,
		);
	}

	public encodeDeleteEntriesRequest(request: DeleteEntriesRequest<K>): Message {
		const keys = this.encodeKeys(request.keys);
        
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
		const keys = this.decodeKeys(message.keys);
        
		return new DeleteEntriesRequest<K>(
			message.requestId!,
			keys,
			message.sourceId,
		);
	}
    
	public encodeDeleteEntriesResponse(response: DeleteEntriesResponse<K>): Message {
		const keys = this.encodeKeys(response.deletedKeys);
        
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
		const deletedKeys = this.decodeKeys(message.keys);
        
		return new DeleteEntriesResponse<K>(
			message.requestId!,
			deletedKeys,
			message.destinationId,
		);
	}

	public encodeDeleteEntriesNotification(notification: DeleteEntriesNotification<K>): Message {
		const keys = this.encodeKeys(notification.keys);
        
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
		const keys = this.decodeKeys(message.keys);
        
		return new DeleteEntriesNotification<K>(
			keys,
			message.sourceId,
			message.destinationId,
		);
	}
    
	public encodeRemoveEntriesRequest(request: RemoveEntriesRequest<K>): Message {
		const keys = this.encodeKeys(request.keys);
        
		return new Message({
			type: MessageType.REMOVE_ENTRIES_REQUEST,
			requestId: request.requestId,
			keys,
			sourceId: request.sourceEndpointId,
			prevValue: request.prevValue !== undefined ? this.valueCodec.encode(request.prevValue as V) : undefined,
		});
	}

	public decodeRemoveEntriesRequest(message: Message): RemoveEntriesRequest<K> {
		if (message.type !== MessageType.REMOVE_ENTRIES_REQUEST) {
			throw new Error('decodeRemoveRequest(): Message type must be REMOVE_ENTRIES_REQUEST');
		}
		const keys = this.decodeKeys(message.keys);
        
		return new RemoveEntriesRequest<K>(
			message.requestId!,
			keys,
			message.prevValue !== undefined ? this.valueCodec.decode(message.prevValue) : undefined,
			message.sourceId,
		);
	}
    
	public encodeRemoveEntriesResponse(response: RemoveEntriesResponse<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(response.removedEntries);
        
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
		const removedEntries = this.decodeEntries(message.keys, message.values);
        
		return new RemoveEntriesResponse<K, V>(
			message.requestId!,
			removedEntries,
			message.destinationId,
		);
	}

	public encodeRemoveEntriesNotification(notification: RemoveEntriesNotification<K>): Message {
		const keys = this.encodeKeys(notification.keys);
        
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
		const keys = this.decodeKeys(message.keys);
        
		return new RemoveEntriesNotification<K>(
			keys,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeEntriesRemovedNotification(notification: EntriesRemovedNotification<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(notification.entries);
		
		return new Message({
			type: MessageType.ENTRIES_REMOVED_NOTIFICATION,
			keys,
			values,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeEntriesRemovedNotification(message: Message): EntriesRemovedNotification<K, V> {
		if (message.type !== MessageType.ENTRIES_REMOVED_NOTIFICATION) {
			throw new Error('decodeEntriesRemovedNotification(): Message type must be ENTRIES_REMOVED_NOTIFICATION');
		}
		const entries = this.decodeEntries(message.keys, message.values);
		
		return new EntriesRemovedNotification<K, V>(
			entries,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeInsertEntriesRequest(request: InsertEntriesRequest<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(request.entries);
        
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
		const entries = this.decodeEntries(message.keys, message.values);
        
		return new InsertEntriesRequest<K, V>(
			message.requestId!,
			entries,
			message.sourceId,
		);
	}
    
	public encodeInsertEntriesResponse(response: InsertEntriesResponse<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(response.existingEntries);
        
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
		const entries = this.decodeEntries(message.keys, message.values);
        
		return new InsertEntriesResponse<K, V>(
			message.requestId!,
			entries,
			message.destinationId,
		);
	}

	public encodeInsertEntriesNotification(notification: InsertEntriesNotification<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(notification.entries);
        
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
		const entries = this.decodeEntries(message.keys, message.values);
        
		return new InsertEntriesNotification<K, V>(
			entries,
			message.sourceId,
			message.destinationId
		);
	}

	public encodeEntriesInsertedNotification(notification: EntriesInsertedNotification<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(notification.entries);
		
		return new Message({
			type: MessageType.ENTRIES_INSERTED_NOTIFICATION,
			keys,
			values,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeEntriesInsertedNotification(message: Message): EntriesInsertedNotification<K, V> {
		if (message.type !== MessageType.ENTRIES_INSERTED_NOTIFICATION) {
			throw new Error('decodeEntriesInsertedNotification(): Message type must be ENTRIES_INSERTED_NOTIFICATION');
		}
		const entries = this.decodeEntries(message.keys, message.values);
		
		return new EntriesInsertedNotification<K, V>(
			entries,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeUpdateEntriesRequest(request: UpdateEntriesRequest<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(request.entries);
		
		return new Message({
			type: MessageType.UPDATE_ENTRIES_REQUEST,
			sourceId: request.sourceEndpointId,
			requestId: request.requestId,
			keys,
			values,
			// prevValue: request.prevValue !== undefined ? this.valueCodec.encode(request.prevValue) : undefined,
			prevValue: request.prevValue !== undefined ? this.valueCodec.encode(request.prevValue) : undefined,
		});
	}

	public decodeUpdateEntriesRequest(message: Message): UpdateEntriesRequest<K, V> {
		if (message.type !== MessageType.UPDATE_ENTRIES_REQUEST) {
			throw new Error('decodeUpdateEntriesRequest(): Message type must be UPDATE_ENTRIES_REQUEST');
		}
		const entries = this.decodeEntries(message.keys, message.values);
        
		return new UpdateEntriesRequest<K, V>(
			message.requestId!,
			entries,
			message.sourceId,
			message.prevValue !== undefined ? this.valueCodec.decode(message.prevValue) : undefined,
		);
	}
    
	public encodeUpdateEntriesResponse(response: UpdateEntriesResponse<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(response.updatedEntries);
        
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
		const updatedEntries = this.decodeEntries(message.keys, message.values);
        
		return new UpdateEntriesResponse<K, V>(
			message.requestId!,
			updatedEntries,
			message.destinationId,
		);
	}

	public encodeUpdateEntriesNotification(notification: UpdateEntriesNotification<K, V>): Message {
		const [ keys, values ] = this.encodeEntries(notification.updatedEntries);
        
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
		const updatedEntries = this.decodeEntries(message.keys, message.values);
        
		return new UpdateEntriesNotification<K, V>(
			updatedEntries,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeEntryUpdatedNotification(notification: EntryUpdatedNotification<K, V>): Message {
		return new Message({
			type: MessageType.ENTRY_UPDATED_NOTIFICATION,
			keys: [ this.keyCodec.encode(notification.key) ],
			values: [ this.valueCodec.encode(notification.newValue) ],
			prevValue: this.valueCodec.encode(notification.oldValue),
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeEntryUpdatedNotification(message: Message): EntryUpdatedNotification<K, V> {
		if (message.type !== MessageType.ENTRY_UPDATED_NOTIFICATION) {
			throw new Error('decodeEntriesUpdatedNotification(): Message type must be ENTRY_UPDATED_NOTIFICATION');
		} else if (message.keys.length < 1) {
			throw new Error('decodeEntriesUpdatedNotification(): Message must have at least one key');
		} else if (message.values.length < 1) {
			throw new Error('decodeEntriesUpdatedNotification(): Message must have at least one value');
		} else if (message.prevValue === undefined) {
			throw new Error('decodeEntriesUpdatedNotification(): Message must have a prevValue');
		}

		const key = this.keyCodec.decode(message.keys[0]);
		const newValue = this.valueCodec.decode(message.values[0]);
		const oldValue = this.valueCodec.decode(message.prevValue!);
		
		return new EntryUpdatedNotification<K, V>(
			key,
			newValue,
			oldValue,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeStorageAppliedCommitNotification(notification: StorageAppliedCommitNotification): Message {
		return new Message({
			type: MessageType.STORAGE_APPLIED_COMMIT_NOTIFICATION,
			raftCommitIndex: notification.appliedCommitIndex,
			sourceId: notification.sourceEndpointId,
		});
	}

	public decodeStorageAppliedCommitNotification(message: Message): StorageAppliedCommitNotification {
		if (message.type !== MessageType.STORAGE_APPLIED_COMMIT_NOTIFICATION) {
			throw new Error('decodeStorageAppliedCommitNotification(): Message type must be STORAGE_APPLIED_COMMIT_NOTIFICATION');
		}
		
		return new StorageAppliedCommitNotification(
			message.raftCommitIndex!,
			message.sourceId,
		);
	}

	public encodeKeys(keys: ReadonlySet<K>): Uint8Array[] {
		return encodeSet<K>(keys, this.keyCodec);
	}

	public decodeKeys(keys: Uint8Array[]): ReadonlySet<K> {
		return decodeSet<K>(keys, this.keyCodec);
	}

	public encodeEntries(entries: ReadonlyMap<K, V>): [keys: Uint8Array[], values: Uint8Array[]] {
		return encodeMap<K, V>(entries, this.keyCodec, this.valueCodec);
	}

	public decodeEntries(keys: Uint8Array[], values: Uint8Array[]): ReadonlyMap<K, V> {
		return decodeMap<K, V>(keys, values, this.keyCodec, this.valueCodec);
	}
    
}
