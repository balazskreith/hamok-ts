export class UpdateEntriesRequest<K, V> {
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

	public createResponse(
		updatedEntries: ReadonlyMap<K, V>
	): UpdateEntriesResponse<K, V> {
		return new UpdateEntriesResponse<K, V>(
			this.requestId,
			updatedEntries,
			this.sourceEndpointId
		);
	}
}

export class UpdateEntriesResponse<K, V> {
	public readonly requestId: string;
	public readonly updatedEntries: ReadonlyMap<K, V>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		updatedEntries: ReadonlyMap<K, V>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.updatedEntries = updatedEntries;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class UpdateEntriesNotification<K, V> {
	public readonly updatedEntries: ReadonlyMap<K, V>;
	public readonly sourceEndpointId?: string;
	public readonly destinationEndpointId?: string;
	public constructor(
		updatedEntries: ReadonlyMap<K, V>,
		sourceEndpointId?: string,
		destinationEndpointId?: string
	) {
		this.updatedEntries = updatedEntries;
		this.sourceEndpointId = sourceEndpointId;
		this.destinationEndpointId = destinationEndpointId;
	}
}
