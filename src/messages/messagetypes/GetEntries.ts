export class GetEntriesRequest<K> {
	public readonly requestId: string;
	public readonly keys: ReadonlySet<K>;
	public readonly sourceEndpointId?: string;
	public constructor(
		keys: ReadonlySet<K>,
		requetId: string,
		sourceEndpointId?: string
	) {
		this.requestId = requetId;
		this.keys = keys;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse<V>(
		foundEntries: ReadonlyMap<K, V>
	): GetEntriesResponse<K, V> {
		return new GetEntriesResponse<K, V>(
			this.requestId,
			foundEntries,
			this.sourceEndpointId
		);
	}
}

export class GetEntriesResponse<K, V> {
	public readonly requestId: string;
	public readonly foundEntries: ReadonlyMap<K, V>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		foundEntries: ReadonlyMap<K, V>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.foundEntries = foundEntries;
		this.destinationEndpointId = destinationEndpointId;
	}
}
