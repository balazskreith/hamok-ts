export class RestoreEntriesRequest<K, V> {
	public readonly requestId: string;
	public readonly entries: ReadonlyMap<K, V>;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		entries: ReadonlyMap<K, V>,
		sourceEndpointId?: string
	) {
		this.requestId = requetId;
		this.entries = entries;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse(): RestoreEntriesResponse {
		return new RestoreEntriesResponse(
			this.requestId,
			this.sourceEndpointId
		);
	}
}

export class RestoreEntriesResponse {
	public readonly requestId: string;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class RestoreEntriesNotification<K, V> {
	public readonly entries: ReadonlyMap<K, V>;
	public readonly sourceEndpointId?: string;
	public readonly destinationEndpointId?: string;
	public constructor(
		entries: ReadonlyMap<K, V>,
		sourceEndpointId?: string,
		destinationEndpointId?: string
	) {
		this.entries = entries;
		this.sourceEndpointId = sourceEndpointId;
		this.destinationEndpointId = destinationEndpointId;
	}
}
