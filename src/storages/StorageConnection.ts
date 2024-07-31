import { EventEmitter } from 'events';
import { 
	HamokMessage, 
	HamokMessage_MessageProtocol as HamokMessageProtocol, 
	HamokMessage_MessageType as HamokMessageType 
} from '../messages/HamokMessage';
import { GetEntriesRequest, GetEntriesResponse } from '../messages/messagetypes/GetEntries';
import { StorageCodec } from '../messages/StorageCodec';
import { v4 as uuid } from 'uuid';
import { createLogger } from '../common/logger';
import { OngoingRequestsNotification } from '../messages/messagetypes/OngoingRequests';
import { ClearEntriesRequest, ClearEntriesNotification, ClearEntriesResponse } from '../messages/messagetypes/ClearEntries';
import { DeleteEntriesRequest, DeleteEntriesNotification, DeleteEntriesResponse } from '../messages/messagetypes/DeleteEntries';
import { EvictEntriesRequest, EvictEntriesNotification, EvictEntriesResponse } from '../messages/messagetypes/EvictEntries';
import { GetKeysRequest } from '../messages/messagetypes/GetKeys';
import { GetSizeRequest } from '../messages/messagetypes/GetSize';
import { InsertEntriesRequest, InsertEntriesNotification, InsertEntriesResponse } from '../messages/messagetypes/InsertEntries';
import { RemoveEntriesRequest, RemoveEntriesNotification, RemoveEntriesResponse } from '../messages/messagetypes/RemoveEntries';
import { RestoreEntriesRequest, RestoreEntriesNotification, RestoreEntriesResponse } from '../messages/messagetypes/RestoreEntries';
import { UpdateEntriesRequest, UpdateEntriesNotification, UpdateEntriesResponse } from '../messages/messagetypes/UpdateEntries';
import { createResponseChunker, ResponseChunker } from '../messages/ResponseChunker';
import * as Collections from '../common/Collections';
import { HamokGrid } from '../HamokGrid';

const logger = createLogger('StorageConnection');

export type StorageConnectionConfig = {

	/**
     * The identifier of the storage the comlink belongs to.
     * In case of a storage builder this infromation is automatically fetched 
     * from the given storage.
     */
	storageId: string,

	/**
         * Determining the timeout for a request generated by this comlink.
         * in case of a storage builder belongs to a hamok grid, the default value is 
         * the grid request timeout config setting
         */
	requestTimeoutInMs: number,

	/**
     * Determine how many response is necessary to resolve the request. 
     */
	neededResponse: number,

	submitting?: ReadonlySet<HamokMessageType>,

	/**
     * The maximum number of keys a response can contain.
     */

	maxOutboundKeys?: number,

	/**
     * The maximum number of values a response can contain.
     */
	maxOutboundValues?: number,

}

export type StorageConnectionEventMap<K, V> = {
	'message': [message: HamokMessage, submit: boolean],
	'leader-changed': [newLeaderId: string | undefined],
	close: [],

	OngoingRequestsNotification: [OngoingRequestsNotification];
	ClearEntriesRequest: [ClearEntriesRequest];
	ClearEntriesNotification: [ClearEntriesNotification];
	GetEntriesRequest: [GetEntriesRequest<K>];
	GetKeysRequest: [GetKeysRequest];
	GetSizeRequest: [GetSizeRequest];
	DeleteEntriesRequest: [DeleteEntriesRequest<K>];
	DeleteEntriesNotification: [DeleteEntriesNotification<K>];
	RemoveEntriesRequest: [RemoveEntriesRequest<K>];
	RemoveEntriesNotification: [RemoveEntriesNotification<K>];
	EvictEntriesRequest: [EvictEntriesRequest<K>];
	EvictEntriesNotification: [EvictEntriesNotification<K>];
	InsertEntriesRequest: [InsertEntriesRequest<K, V>];
	InsertEntriesNotification: [InsertEntriesNotification<K, V>];
	UpdateEntriesRequest: [UpdateEntriesRequest<K, V>];
	UpdateEntriesNotification: [UpdateEntriesNotification<K, V>];
	RestoreEntriesRequest: [RestoreEntriesRequest<K, V>];
	RestoreEntriesNotification: [RestoreEntriesNotification<K, V>];
}

export type StorageConnectionResponseMap<K, V> = {
	GetEntriesResponse: GetEntriesResponse<K, V>;
	ClearEntriesResponse: ClearEntriesResponse;
	DeleteEntriesResponse: DeleteEntriesResponse<K>;
	RemoveEntriesResponse: RemoveEntriesResponse<K, V>;
	EvictEntriesResponse: EvictEntriesResponse;
	InsertEntriesResponse: InsertEntriesResponse<K, V>;
	UpdateEntriesResponse: UpdateEntriesResponse<K, V>;
	RestoreEntriesResponse: RestoreEntriesResponse;
}

export class StorageConnection<K, V> extends EventEmitter<StorageConnectionEventMap<K, V>> {
	private readonly _responseChunker: ResponseChunker;

	private _closed = false;

	public constructor(
		public readonly config: StorageConnectionConfig,
		public readonly codec: StorageCodec<K, V>,
		public readonly grid: HamokGrid,
	) {
		super();

		this._responseChunker = createResponseChunker(
			config.maxOutboundKeys ?? 0,
			config.maxOutboundValues ?? 0,
		);
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		const rejectedRequestIds: string[] = [];

		for (const pendingRequest of this.grid.pendingRequests.values()) {
			if (pendingRequest.config.storageId !== this.config.storageId) continue;
			pendingRequest.reject('Connection is closed');

			rejectedRequestIds.push(pendingRequest.id);
		}

		this.grid.purgeResponseForRequests(rejectedRequestIds);

		for (const activeOngoingRequest of this.grid.ongoingRequestsNotifier.activeOngoingRequests.values()) {
			if (activeOngoingRequest.storageId !== this.config.storageId) continue;

			this.grid.ongoingRequestsNotifier.remove(activeOngoingRequest.requestId);
		}

		this.emit('close');

		this.removeAllListeners();
	}

	public accept(message: HamokMessage) {
		this.codec.decode(message, this._emitDecoded.bind(this));
	}

	private _emitDecoded(type: string, output: unknown) {
		if (!(this as EventEmitter).emit(type, output)) {
			logger.warn('Unhandled message type %s', type);
		}
	}

	public async requestGetEntries(
		keys: ReadonlySet<K>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();
		const responseMessages = await Promise.all(
			Collections.splitSet<K>(
				keys,
				this.config.maxOutboundKeys ?? 0,
				() => [ keys ]
			).map((batchedEntries) => this._request({
				message: this.codec.encodeGetEntriesRequest(
					new GetEntriesRequest(
						batchedEntries,
						uuid(),
					)
				),
				targetPeerIds, 
			}))
		);

		responseMessages.flatMap((responses) => responses)
			.map((response) => this.codec.decodeGetEntriesResponse(response))
			.forEach((response) => Collections.concatMaps(
				result,
				response.foundEntries
			));
		
		return result;
	}

	public async requestGetKeys(
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlySet<K>> {
		const result = new Set<K>();

		(await this._request({
			message: this.codec.encodeGetKeysRequest(
				new GetKeysRequest(
					uuid(),
				)
			),
			targetPeerIds,
		}))
			.map((response) => this.codec.decodeGetKeysResponse(response))
			.forEach((response) => Collections.concatSet(
				result,
				response.keys
			));
		
		return result;
	}

	public async requestClearEntries(
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<void> {
		return this._request({
			message: this.codec.encodeClearEntriesRequest(
				new ClearEntriesRequest(
					uuid(),
				)
			),
			targetPeerIds
		}).then(() => void 0);
	}

	public notifyClearEntries(targetPeerIds?: ReadonlySet<string>) {
		this._sendMessage(this.codec.encodeClearEntriesNotification(new ClearEntriesNotification()), targetPeerIds);
	}

	public async requestDeleteEntries(
		keys: ReadonlySet<K>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlySet<K>> {
		const result = new Set<K>();

		const responseMessages = await Promise.all(
			Collections.splitSet<K>(
				keys,
				this.config.maxOutboundKeys ?? 0,
				() => [ keys ]
			).map((batchedEntries) => this._request({
				message: this.codec.encodeDeleteEntriesRequest(
					new DeleteEntriesRequest(
						uuid(),
						batchedEntries,
					)
				),
				targetPeerIds
			}))
		);

		responseMessages.flatMap((responses) => responses)
			.map((response) => this.codec.decodeDeleteEntriesResponse(response))
			.forEach((response) => Collections.concatSet(
				result,
				response.deletedKeys
			));
		
		return result;
	}

	public notifyDeleteEntries(keys: ReadonlySet<K>, targetPeerIds?: ReadonlySet<string>) {
		Collections.splitSet<K>(
			keys,
			this.config.maxOutboundKeys ?? 0,
			() => [ keys ]
		)
			.map((batchedEntries) => this.codec.encodeDeleteEntriesNotification(new DeleteEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public async requestRemoveEntries(
		keys: ReadonlySet<K>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		const responseMessages = await Promise.all(
			Collections.splitSet<K>(
				keys,
				this.config.maxOutboundKeys ?? 0,
				() => [ keys ]
			).map((batchedEntries) => this._request({
				message: this.codec.encodeRemoveEntriesRequest(
					new RemoveEntriesRequest(
						uuid(),
						batchedEntries,
					)
				),
				targetPeerIds
			}))
		);

		responseMessages.flatMap((responses) => responses)
			.map((response) => this.codec.decodeRemoveEntriesResponse(response))
			.forEach((response) => Collections.concatMaps(
				result,
				response.removedEntries
			));
		
		return result;
	}

	public notifyRemoveEntries(keys: ReadonlySet<K>, targetPeerIds?: ReadonlySet<string>) {
		Collections.splitSet<K>(
			keys,
			this.config.maxOutboundKeys ?? 0,
			() => [ keys ]
		)
			.map((batchedEntries) => this.codec.encodeRemoveEntriesNotification(new RemoveEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public async requestInsertEntries(
		entries: ReadonlyMap<K, V>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		const responseMessages = await Promise.all(
			Collections.splitMap<K, V>(
				entries,
				Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
				() => [ entries ]
			).map((batchedEntries) => this._request({
				message: this.codec.encodeInsertEntriesRequest(
					new InsertEntriesRequest(
						uuid(),
						batchedEntries,
					)
				),
				targetPeerIds
			}))
		);

		responseMessages.flatMap((responses) => responses)
			.map((response) => this.codec.decodeInsertEntriesResponse(response))
			.forEach((response) => Collections.concatMaps(
				result,
				response.existingEntries
			));
		
		return result;
	}

	public notifyInsertEntries(entries: ReadonlyMap<K, V>, targetPeerIds?: ReadonlySet<string>) {
		Collections.splitMap<K, V>(
			entries,
			Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
			() => [ entries ]
		)
			.map((batchedEntries) => this.codec.encodeInsertEntriesNotification(new InsertEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public async requestUpdateEntries(
		entries: ReadonlyMap<K, V>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlyMap<K, V>> {
		const result = new Map<K, V>();

		const responseMessages = await Promise.all(
			Collections.splitMap<K, V>(
				entries,
				Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
				() => [ entries ]
			).map((batchedEntries) => this._request({
				message: this.codec.encodeUpdateEntriesRequest(
					new UpdateEntriesRequest(
						uuid(),
						batchedEntries,
					)
				),
				targetPeerIds
			}))
		);

		responseMessages.flatMap((responses) => responses)
			.map((response) => this.codec.decodeUpdateEntriesResponse(response))
			.forEach((response) => Collections.concatMaps(
				result,
				response.updatedEntries
			));
		
		return result;
	}

	public notifyUpdateEntries(entries: ReadonlyMap<K, V>, targetPeerIds?: ReadonlySet<string>) {
		Collections.splitMap<K, V>(
			entries,
			Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
			() => [ entries ]
		)
			.map((batchedEntries) => this.codec.encodeUpdateEntriesNotification(new UpdateEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public respond<U extends keyof StorageConnectionResponseMap<K, V>>(type: U, response: StorageConnectionResponseMap<K, V>[U], targetPeerIds?: string | string[]): void {
		let message: HamokMessage | undefined;

		switch (type) {
			case 'GetEntriesResponse':
				message = this.codec.encodeGetEntriesResponse(response as GetEntriesResponse<K, V>);
				break;
			case 'ClearEntriesResponse':
				message = this.codec.encodeClearEntriesResponse(response as ClearEntriesResponse);
				break;
			case 'DeleteEntriesResponse':
				message = this.codec.encodeDeleteEntriesResponse(response as DeleteEntriesResponse<K>);
				break;
			case 'RemoveEntriesResponse':
				message = this.codec.encodeRemoveEntriesResponse(response as RemoveEntriesResponse<K, V>);
				break;
			case 'EvictEntriesResponse':
				message = this.codec.encodeEvictEntriesResponse(response as EvictEntriesResponse);
				break;
			case 'InsertEntriesResponse':
				message = this.codec.encodeInsertEntriesResponse(response as InsertEntriesResponse<K, V>);
				break;
			case 'UpdateEntriesResponse':
				message = this.codec.encodeUpdateEntriesResponse(response as UpdateEntriesResponse<K, V>);
				break;
			case 'RestoreEntriesResponse':
				message = this.codec.encodeRestoreEntriesResponse(response as RestoreEntriesResponse);
				break;
		}
		if (!message) {
			return logger.warn('Cannot encode response for type %s', type);
		}

		for (const chunk of this._responseChunker.apply(message)) {
			// logger.info("Sending response message", message.type);
			this._sendMessage(
				chunk,
				targetPeerIds ? new Set(Array.isArray(targetPeerIds) ? targetPeerIds : [ targetPeerIds ]) : undefined
			);
		}
	}

	private async _request(options: {
		message: HamokMessage, 
		targetPeerIds?: ReadonlySet<string> | string[], 
	}): Promise<HamokMessage[]> {
		options.message.storageId = this.config.storageId;
		options.message.protocol = HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL;
		
		return this.grid.request({
			message: options.message,
			timeoutInMs: this.config.requestTimeoutInMs,
			neededResponses: this.config.neededResponse,
			targetPeerIds: options.targetPeerIds,
			submit: options.message.type ? this.config.submitting?.has(options.message.type) : false,
		});
	}

	private _sendMessage(message: HamokMessage, targetPeerIds?: ReadonlySet<string> | string[]) {
		message.storageId = this.config.storageId;
		message.protocol = HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL;

		this.grid.sendMessage(message, targetPeerIds);
	}
}