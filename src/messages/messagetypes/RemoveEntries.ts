export class RemoveEntriesRequest<K> {
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

	public createResponse<V>(
		removedEntries: ReadonlyMap<K, V>
	): RemoveEntriesResponse<K, V> {
		return new RemoveEntriesResponse<K, V>(
			this.requestId,
			removedEntries,
			this.sourceEndpointId
		);
	}
}

export class RemoveEntriesResponse<K, V> {
	public readonly requestId: string;
	public readonly removedEntries: ReadonlyMap<K, V>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		removedEntries: ReadonlyMap<K, V>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.removedEntries = removedEntries;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class RemoveEntriesNotification<K> {
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

export class EntriesRemovedNotification<K, V> {
	public constructor(
		public readonly entries: ReadonlyMap<K, V>,
		public readonly sourceEndpointId?: string,
		public readonly destinationEndpointId?: string
	) {
		// empty
	}
}
