export class DeleteEntriesRequest<K> {
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

	public createResponse(
		deletedKeys: ReadonlySet<K>
	): DeleteEntriesResponse<K> {
		return new DeleteEntriesResponse<K>(
			this.requestId,
			deletedKeys,
			this.sourceEndpointId
		);
	}
}

export class DeleteEntriesResponse<K> {
	public readonly requestId: string;
	public readonly deletedKeys: ReadonlySet<K>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		deletedKeys: ReadonlySet<K>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.deletedKeys = deletedKeys;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class DeleteEntriesNotification<K> {
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
