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
import { GetKeysRequest, GetKeysResponse } from '../messages/messagetypes/GetKeys';
import { GetSizeRequest } from '../messages/messagetypes/GetSize';
import { InsertEntriesRequest, InsertEntriesNotification, InsertEntriesResponse, EntriesInsertedNotification } from '../messages/messagetypes/InsertEntries';
import { RemoveEntriesRequest, RemoveEntriesNotification, RemoveEntriesResponse, EntriesRemovedNotification } from '../messages/messagetypes/RemoveEntries';
import { UpdateEntriesRequest, UpdateEntriesNotification, UpdateEntriesResponse, EntryUpdatedNotification } from '../messages/messagetypes/UpdateEntries';
import { createResponseChunker, ResponseChunker } from '../messages/ResponseChunker';
import * as Collections from '../common/Collections';
import { HamokGrid } from '../HamokGrid';
import { StorageAppliedCommitNotification } from '../messages/messagetypes/StorageAppliedCommit';
import { StorageHelloNotification } from '../messages/messagetypes/StorageHelloNotification';
import { StorageStateNotification } from '../messages/messagetypes/StorageStateNotification';

const logger = createLogger('HamokConnection');

export type HamokConnectionConfig = {

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

	/**
	 * The maximum time in milliseconds to wait for storage state notification from a remote peer.
	 * 
	 * DEFAULT: 1000
	 */
	remoteStorageStateWaitingTimeoutInMs: number,
}

export type HamokConnectionEventMap<K, V> = {
	'message': [message: HamokMessage, submit: boolean],
	'leader-changed': [newLeaderId: string | undefined],
	'remote-peer-removed': [remotePeerId: string],
	connected: [],
	disconnected: [],
	close: [],

	OngoingRequestsNotification: [OngoingRequestsNotification];
	ClearEntriesRequest: [ClearEntriesRequest, commitIndex?: number];
	ClearEntriesNotification: [ClearEntriesNotification];
	GetEntriesRequest: [GetEntriesRequest<K>];
	GetKeysRequest: [GetKeysRequest];
	GetSizeRequest: [GetSizeRequest];
	DeleteEntriesRequest: [DeleteEntriesRequest<K>, commitIndex?: number];
	DeleteEntriesNotification: [DeleteEntriesNotification<K>];
	RemoveEntriesRequest: [RemoveEntriesRequest<K>, commitIndex?: number];
	RemoveEntriesNotification: [RemoveEntriesNotification<K>];
	EntriesRemovedNotification: [EntriesRemovedNotification<K, V>];
	InsertEntriesRequest: [InsertEntriesRequest<K, V>, commitIndex?: number];
	InsertEntriesNotification: [InsertEntriesNotification<K, V>];
	EntriesInsertedNotification: [EntriesInsertedNotification<K, V>];
	UpdateEntriesRequest: [UpdateEntriesRequest<K, V>, commitIndex?: number];
	UpdateEntriesNotification: [UpdateEntriesNotification<K, V>];
	EntryUpdatedNotification: [EntryUpdatedNotification<K, V>];
	StorageAppliedCommitNotification: [StorageAppliedCommitNotification];
	StorageHelloNotification: [StorageHelloNotification];
	StorageStateNotification: [StorageStateNotification];
	'remote-snapshot': [serializedSnapshot: string, done: () => void];
}

export type HamokConnectionResponseMap<K, V> = {
	GetEntriesResponse: GetEntriesResponse<K, V>;
	GetKeysResponse: GetKeysResponse<K>;
	ClearEntriesResponse: ClearEntriesResponse;
	DeleteEntriesResponse: DeleteEntriesResponse<K>;
	RemoveEntriesResponse: RemoveEntriesResponse<K, V>;
	InsertEntriesResponse: InsertEntriesResponse<K, V>;
	UpdateEntriesResponse: UpdateEntriesResponse<K, V>;
}

export declare interface HamokConnection<K, V> {
	on<U extends keyof HamokConnectionEventMap<K, V>>(event: U, listener: (...args: HamokConnectionEventMap<K, V>[U]) => void): this;
	once<U extends keyof HamokConnectionEventMap<K, V>>(event: U, listener: (...args: HamokConnectionEventMap<K, V>[U]) => void): this;
	off<U extends keyof HamokConnectionEventMap<K, V>>(event: U, listener: (...args: HamokConnectionEventMap<K, V>[U]) => void): this;
	emit<U extends keyof HamokConnectionEventMap<K, V>>(event: U, ...args: HamokConnectionEventMap<K, V>[U]): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class HamokConnection<K, V> extends EventEmitter {
	private readonly _responseChunker: ResponseChunker;

	private _closed = false;
	private _connected: boolean;
	private _joined = false;
	private _appliedCommitIndex = -1;
	private _joining?: Promise<void>;
	private _bufferedMessages: [ HamokMessage, number | undefined ][] = [];
	
	public constructor(
		public readonly config: HamokConnectionConfig,
		public readonly codec: StorageCodec<K, V>,
		public readonly grid: HamokGrid,
	) {
		super();
		this.setMaxListeners(Infinity);
		this._leaderChangedListener = this._leaderChangedListener.bind(this);

		this._responseChunker = createResponseChunker(
			config.maxOutboundKeys ?? 0,
			config.maxOutboundValues ?? 0,
		);
		
		this._connected = this.grid.leaderId !== undefined;
		this.on('leader-changed', this._leaderChangedListener);
	}

	public get closed() {
		return this._closed;
	}

	public get localPeerId() {
		return this.grid.localPeerId;
	}

	public get connected() {
		return this._connected;
	}

	public get highestSeenCommitIndex() {
		return this._appliedCommitIndex;
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

	public async join(): Promise<void> {
		if (this._joined) return;
		if (this._joining) return this._joining;
		
		try {
			this._joining = this._join();
			await this._joining;
			this._joining = undefined;
			logger.debug('%s Connection for storage %s is joined', this.localPeerId, this.config.storageId);
		} catch (err) {
			logger.error('Failed to join connection, retrying', err);
			this._joining = undefined;
			
			if (this._closed) return;
			
			return this.join();
		}
	}

	public accept(message: HamokMessage, commitIndex?: number) {
		if (this._closed) {
			return logger.warn('Connection for storage %s is closed, cannot accept message %o', this.config.storageId, message);
		}
		if (!this._joined) {
			switch (message.type) {
				case HamokMessageType.STORAGE_HELLO_NOTIFICATION: {
					const hello = this.codec.decodeStorageHelloNotification(message);

					if (hello.sourceEndpointId === this.grid.localPeerId) {
						return;
					}

					this.emit('StorageHelloNotification', hello);
					break;
				}
					
				case HamokMessageType.STORAGE_STATE_NOTIFICATION: {
					const state = this.codec.decodeStorageStateNotification(message);

					if (state.sourceEndpointId === this.grid.localPeerId) {
						return;
					}

					this.emit('StorageStateNotification', state);
					break;
				}
				default:
					logger.debug('Buffering message %o until the connection is joined. commitIndex: %d', message, commitIndex);
					this._bufferedMessages.push([ message, commitIndex ]);
					break;
			}

			return;
		}

		if (commitIndex !== undefined) {
			// logger.info('%s Received message with commit index %d -> %d, %d', 
			// 	this.localPeerId, 
			// 	commitIndex, 
			// 	message.type,
			// 	message.type === HamokMessageType.INSERT_ENTRIES_REQUEST ? this.codec.valueCodec.decode(message.values[0]) : -1
			// );
			if (commitIndex <= this._appliedCommitIndex) {
				return logger.warn('Received message with commit index %d is older or equal than the last applied commit index %d', commitIndex, this._appliedCommitIndex);
			}
			// only in test purposes
			// if (this._appliedCommitIndex + 1 !== commitIndex) {
			// 	logger.warn('Received message with commit index %d is not the next commit index after the last applied commit index %d', commitIndex, this._appliedCommitIndex);
			// }
			this._appliedCommitIndex = commitIndex;
		}

		switch (message.type) {
			case HamokMessageType.CLEAR_ENTRIES_REQUEST:
				this.emit(
					'ClearEntriesRequest',
					this.codec.decodeClearEntriesRequest(message),
					commitIndex,
				);
				break;
			case HamokMessageType.CLEAR_ENTRIES_NOTIFICATION:
				this.emit(
					'ClearEntriesNotification',
					this.codec.decodeClearEntriesNotification(message),
				);
				break;
			case HamokMessageType.GET_ENTRIES_REQUEST:
				this.emit(
					'GetEntriesRequest',
					this.codec.decodeGetEntriesRequest(message),
				);
				break;
			case HamokMessageType.GET_SIZE_REQUEST:
				this.emit(
					'GetSizeRequest',
					this.codec.decodeGetSizeRequest(message),
				);
				break;
			case HamokMessageType.GET_KEYS_REQUEST:
				this.emit(
					'GetKeysRequest',
					this.codec.decodeGetKeysRequest(message),
				);
				break;
			case HamokMessageType.DELETE_ENTRIES_REQUEST:
				this.emit(
					'DeleteEntriesRequest',
					this.codec.decodeDeleteEntriesRequest(message),
					commitIndex,
				);
				break;
			case HamokMessageType.DELETE_ENTRIES_NOTIFICATION:
				this.emit(
					'DeleteEntriesNotification',
					this.codec.decodeDeleteEntriesNotification(message),
				);
				break;
			case HamokMessageType.REMOVE_ENTRIES_REQUEST:
				this.emit(
					'RemoveEntriesRequest',
					this.codec.decodeRemoveEntriesRequest(message),
					commitIndex,
				);
				break;
			case HamokMessageType.REMOVE_ENTRIES_NOTIFICATION:
				this.emit(
					'RemoveEntriesNotification',
					this.codec.decodeRemoveEntriesNotification(message),
				);
				break;
			case HamokMessageType.ENTRIES_REMOVED_NOTIFICATION:
				this.emit(
					'EntriesRemovedNotification',
					this.codec.decodeEntriesRemovedNotification(message),
				);
				break;
			case HamokMessageType.INSERT_ENTRIES_REQUEST:
				this.emit(
					'InsertEntriesRequest',
					this.codec.decodeInsertEntriesRequest(message),
					commitIndex,
				);
				break;
			case HamokMessageType.INSERT_ENTRIES_NOTIFICATION:
				this.emit(
					'InsertEntriesNotification',
					this.codec.decodeInsertEntriesNotification(message),
				);
				break;
			case HamokMessageType.ENTRIES_INSERTED_NOTIFICATION:
				this.emit(
					'EntriesInsertedNotification',
					this.codec.decodeEntriesInsertedNotification(message),
				);
				break;
			case HamokMessageType.UPDATE_ENTRIES_REQUEST:
				this.emit(
					'UpdateEntriesRequest',
					this.codec.decodeUpdateEntriesRequest(message),
					commitIndex,
				);
				break;
			case HamokMessageType.UPDATE_ENTRIES_NOTIFICATION:
				this.emit(
					'UpdateEntriesNotification',
					this.codec.decodeUpdateEntriesNotification(message),
				);
				break;
			case HamokMessageType.ENTRY_UPDATED_NOTIFICATION:
				this.emit(
					'EntryUpdatedNotification',
					this.codec.decodeEntryUpdatedNotification(message),
				);
				break;
			case HamokMessageType.STORAGE_APPLIED_COMMIT_NOTIFICATION:
				this.emit(
					'StorageAppliedCommitNotification',
					this.codec.decodeStorageAppliedCommitNotification(message),
				);
				break;
			case HamokMessageType.STORAGE_HELLO_NOTIFICATION:
				message.sourceId !== this.grid.localPeerId && this.emit(
					'StorageHelloNotification',
					this.codec.decodeStorageHelloNotification(message),
				);
				break;
			case HamokMessageType.STORAGE_STATE_NOTIFICATION:
				this.emit(
					'StorageStateNotification',
					this.codec.decodeStorageStateNotification(message),
				);
				break;
		}
	}

	public notifyStorageHello(targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyStorageHello(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		logger.debug('%s Sending storage hello notification to %s', this.localPeerId, targetPeerIds);
		
		return this._sendMessage(this.codec.encodeStorageHelloNotification(new StorageHelloNotification(
			this.grid.localPeerId,
		)), targetPeerIds);
	}

	public notifyStorageState(serializedStorageSnapshot: string, appliedCommitIndex: number, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		const message = new StorageStateNotification(
			this.grid.localPeerId,
			serializedStorageSnapshot,
			appliedCommitIndex,
		);

		return this._sendMessage(this.codec.encodeStorageStateNotification(message), targetPeerIds);
	}

	public async requestGetEntries(
		keys: ReadonlySet<K>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlyMap<K, V>> {
		if (this._closed) throw new Error(`requestGetEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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
		if (this._closed) throw new Error(`requestGetKeys(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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
		if (this._closed) throw new Error(`requestClearEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		return this._request({
			message: this.codec.encodeClearEntriesRequest(
				new ClearEntriesRequest(
					uuid(),
				)
			),
			targetPeerIds
		}).then(() => void 0);
	}

	public notifyClearEntries(targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyClearEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		this._sendMessage(this.codec.encodeClearEntriesNotification(new ClearEntriesNotification()), targetPeerIds);
	}

	public async requestDeleteEntries(
		keys: ReadonlySet<K>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlySet<K>> {
		if (this._closed) throw new Error(`requestDeleteEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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

		// sort the messages by source ids to make sure the order of the responses
		// are consistent on all peers
		sortMessagesBySourceIds(responseMessages.flatMap((responses) => responses))
			.map((response) => this.codec.decodeDeleteEntriesResponse(response))
			.forEach((response) => Collections.concatSet(
				result,
				response.deletedKeys
			));
		
		return result;
	}

	public notifyDeleteEntries(keys: ReadonlySet<K>, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyDeleteEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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
		if (this._closed) throw new Error(`requestRemoveEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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

	public notifyRemoveEntries(keys: ReadonlySet<K>, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyRemoveEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		Collections.splitSet<K>(
			keys,
			this.config.maxOutboundKeys ?? 0,
			() => [ keys ]
		)
			.map((batchedEntries) => this.codec.encodeRemoveEntriesNotification(new RemoveEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public notifyEntriesRemoved(entries: ReadonlyMap<K, V>, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyEntriesRemoved(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		Collections.splitMap<K, V>(
			entries,
			Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
			() => [ entries ]
		)
			.map((batchedEntries) => this.codec.encodeEntriesRemovedNotification(new EntriesRemovedNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public async requestInsertEntries(
		entries: ReadonlyMap<K, V>,
		targetPeerIds?: ReadonlySet<string> | string[]
	): Promise<ReadonlyMap<K, V>> {
		if (this._closed) throw new Error(`requestInsertEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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

	public notifyInsertEntries(entries: ReadonlyMap<K, V>, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyInsertEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		Collections.splitMap<K, V>(
			entries,
			Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
			() => [ entries ]
		)
			.map((batchedEntries) => this.codec.encodeInsertEntriesNotification(new InsertEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public notifyEntriesInserted(entries: ReadonlyMap<K, V>, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyEntriesInserted(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		Collections.splitMap<K, V>(
			entries,
			Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
			() => [ entries ]
		)
			.map((batchedEntries) => this.codec.encodeEntriesInsertedNotification(new EntriesInsertedNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public async requestUpdateEntries(
		entries: ReadonlyMap<K, V>,
		targetPeerIds?: ReadonlySet<string> | string[] | string,
		prevValue?: V
	): Promise<ReadonlyMap<K, V>> {
		if (this._closed) throw new Error(`requestUpdateEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

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
						undefined,
						prevValue,
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

	public notifyUpdateEntries(entries: ReadonlyMap<K, V>, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyUpdateEntries(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		Collections.splitMap<K, V>(
			entries,
			Math.max(this.config.maxOutboundKeys ?? 0, this.config.maxOutboundValues ?? 0),
			() => [ entries ]
		)
			.map((batchedEntries) => this.codec.encodeUpdateEntriesNotification(new UpdateEntriesNotification(batchedEntries)))
			.forEach((notification) => this._sendMessage(notification, targetPeerIds));
	}

	public notifyEntryUpdated(key: K, oldValue: V, newValue: V, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyEntryUpdated(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		const message = this.codec.encodeEntryUpdatedNotification(
			new EntryUpdatedNotification(key, newValue, oldValue)
		);

		this._sendMessage(message, targetPeerIds);
	}

	public notifyStorageAppliedCommit(commitIndex: number, targetPeerIds?: ReadonlySet<string> | string[] | string) {
		if (this._closed) throw new Error(`notifyStorageAppliedCommit(): Cannot send message on a closed connection for storage ${this.config.storageId}`);

		const message = this.codec.encodeStorageAppliedCommitNotification(
			new StorageAppliedCommitNotification(commitIndex)
		);

		this._sendMessage(message, targetPeerIds);
	}

	public respond<U extends keyof HamokConnectionResponseMap<K, V>>(type: U, response: HamokConnectionResponseMap<K, V>[U], targetPeerIds?: string | string[]): void {
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
			case 'InsertEntriesResponse':
				message = this.codec.encodeInsertEntriesResponse(response as InsertEntriesResponse<K, V>);
				break;
			case 'UpdateEntriesResponse':
				message = this.codec.encodeUpdateEntriesResponse(response as UpdateEntriesResponse<K, V>);
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
		targetPeerIds?: ReadonlySet<string> | string[] | string, 
	}): Promise<HamokMessage[]> {
		options.message.storageId = this.config.storageId;
		options.message.protocol = HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL;

		// if there is a join process ongoing we wait until it is finished
		await this._joining;
		
		return this.grid.request({
			message: options.message,
			timeoutInMs: this.config.requestTimeoutInMs,
			neededResponses: this.config.neededResponse,
			targetPeerIds: options.targetPeerIds,
			submit: options.message.type ? this.config.submitting?.has(options.message.type) : false,
		});
	}

	private _sendMessage(message: HamokMessage, targetPeerIds?: ReadonlySet<string> | string[] | string): void {
		message.storageId = this.config.storageId;
		message.protocol = HamokMessageProtocol.STORAGE_COMMUNICATION_PROTOCOL;

		if (this._joining) {
			// we only send storage hello or state notification during the join phase
			if (
				message.type !== HamokMessageType.STORAGE_HELLO_NOTIFICATION &&
				message.type !== HamokMessageType.STORAGE_STATE_NOTIFICATION
			) {
				logger.debug('%s Buffering message %s until the connection is joined', this.localPeerId, message.type);
				this._joining.then(() => this._sendMessage(message, targetPeerIds));

				return;
			}
		}

		this.grid.sendMessage(message, targetPeerIds);
	}

	private async _join(retried = 0): Promise<void> {

		// we must buffer all messages received during join process (except state notification)
		this._joined = false;
		const stateNotification = await this._fetchStorageState();

		// if we have a state notification we need to apply it
		if (stateNotification) {
			// restart if tdisconnect happens while this!
			try {
				await new Promise<void>((resolve, reject) => {
					const disconnected = () => reject('disconnected');
					const closed = () => reject('closed');
					const done = () => {
						this.off('disconnected', disconnected);
						this.off('close', closed);
						resolve();
					};
	
					this.once('disconnected', disconnected);
					this.once('close', closed);
					this.emit('remote-snapshot', stateNotification.serializedStorageSnapshot, done);
				});
			} catch (err) {
				logger.warn('Failed to join the storage connection %s. retried: %d', err, retried);

				// we restart the process until we are able to be joined or max retry count is reached
				return this._join(retried + 1);
			}

			// we set the applied commit index to the received one
			logger.info('Storage %s processed a remote snapshot and change it\'s applied commitIndex from %d to %d', 
				this.config.storageId, 
				this._appliedCommitIndex,
				stateNotification.commitIndex
			);
			this._appliedCommitIndex = stateNotification.commitIndex;
		}

		// the funny thing here is that if the remote peer committed logs meanwhile the snapshot is created and and sent it back (few heartbeats),
		// and those commits are related to this storage, and those are already emitted, then the commit index of the RAFT logs is higher than the commit index 
		// the snapshot is applied on, so we need to collect those messages and replay them
		if (this._appliedCommitIndex < this.grid.logs.commitIndex) {
			const entries = this.grid.logs.collectEntries(this._appliedCommitIndex, Math.min(
				this.grid.logs.commitIndex + 1, // we need the commit index as well
				this.grid.logs.nextIndex
			));

			logger.debug('Buffering messages %d until the connection is joined', entries.length);

			for (const logEntry of entries) {
				if (logEntry.entry.storageId !== this.config.storageId) continue;

				logger.debug('Processing buffered message %d', logEntry.index);
				// it should goes to the buffered messages
				this.accept(logEntry.entry, logEntry.index);
			}
		}

		const bufferedMessages = this._bufferedMessages;

		this._bufferedMessages = [];

		logger.trace('Buffered messages %o, appliedCommitIndex: %d, commitIndex: %d, nextIndex: %d', 
			bufferedMessages, 
			this._appliedCommitIndex, 
			this.grid.logs.commitIndex,
			this.grid.logs.nextIndex,
		);
		
		// now we can accept messages
		this._joined = true;

		for (const [ message, commitIndex ] of bufferedMessages) {
			if (commitIndex !== undefined && commitIndex < this._appliedCommitIndex) continue;
			logger.trace('%s Processing buffered message %d', this.localPeerId, commitIndex);
			this.accept(message, commitIndex);
		}
	}

	private async _fetchStorageState(retried = 0): Promise<StorageStateNotification | undefined> {
		try {
			if (!this.connected) {
				await new Promise<void>((resolve, reject) => {
					const connected = () => {
						resolve();
						this.off('disconnected', disconnected);
						this.off('close', closed);
					};
					const disconnected = () => {
						reject('disconnected');
						this.off('connected', connected);
						this.off('close', closed);
					};
					const closed = () => {
						reject('closed');
						this.off('connected', connected);
						this.off('disconnected', disconnected);
					};
	
					this.once('connected', connected);
					this.once('disconnected', disconnected);
					this.once('close', closed);
				});
			}
		} catch (err) {
			logger.warn('Failed to join the storage connection %s', err);

			// we restart the process until we are able to be joined or max retry count is reached
			return this._fetchStorageState(retried + 1);
		}
	
		// if the connection got disconnected during the join phase it will automatically fails as no response is received
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.off('StorageStateNotification', receiveStorageStateNotification);
				logger.debug('%s no response received for storage state notification, most likely the storage %s is alone', this.localPeerId, this.config.storageId);
				resolve(undefined);
			}, this.config.remoteStorageStateWaitingTimeoutInMs ?? 1000);
		
			const receiveStorageStateNotification = (notification: StorageStateNotification) => {
				clearTimeout(timer);
				this.off('StorageStateNotification', receiveStorageStateNotification);
					
				resolve(notification);
			};
	
			this.once('StorageStateNotification', receiveStorageStateNotification);
			this.notifyStorageHello();
		});
		
	}

	private _leaderChangedListener(leaderId?: string) {
		if (this._connected && leaderId === undefined) {
			this._connected = false;
			
			// this will automatically restarts the joining process if there is any ongoing
			this.emit('disconnected');

			if (!this._joining) {
				// if there is no join process ongoing we must initiate one
				logger.warn('%s storage %s is disconnected, starting join process', this.localPeerId, this.config.storageId);
				this.join().catch((err) => logger.warn('Failed to join the storage connection %s', err));
			}
		} else if (!this._connected && leaderId !== undefined) {
			this._connected = true;
			this.emit('connected');
		}
	}
}

function sortMessagesBySourceIds(messages: HamokMessage[]): HamokMessage[] {
	const result = new Map<string, HamokMessage[]>();

	for (const message of messages) {
		let sourceId = message.sourceId;

		if (!sourceId) {
			sourceId = '0';
		}

		const messagesFromSource = result.get(sourceId) ?? [];

		messagesFromSource.push(message);
		result.set(sourceId, messagesFromSource);
	}

	return [ ...result.entries() ].sort(([ a ], [ b ]) => a.localeCompare(b)).flatMap(([ , msgs ]) => msgs);
}
