export class EvictEntriesRequest<K> {
	public readonly requestId: string;
	public readonly keys: ReadonlySet<K>;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		keys: ReadonlySet<K>,
		sourceEndpointId?: string
	) {
		this.requestId = requetId;
		this.keys = keys;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse(): EvictEntriesResponse {
		return new EvictEntriesResponse(
			this.requestId,
			this.sourceEndpointId
		);
	}
}

export class EvictEntriesResponse {
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

export class EvictEntriesNotification<K> {
	public readonly keys: ReadonlySet<K>;
	public readonly sourceEndpointId?: string;
	public readonly destinationEndpointId?: string;
	public constructor(
		keys: ReadonlySet<K>,
		sourceEndpointId?: string,
		destinationEndpointId?: string
	) {
		this.keys = keys;
		this.sourceEndpointId = sourceEndpointId;
		this.destinationEndpointId = destinationEndpointId;
	}
}
