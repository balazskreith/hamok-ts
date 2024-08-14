export class InsertEntriesRequest<K, V> {
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

	public createResponse(existingEntries: ReadonlyMap<K, V>): InsertEntriesResponse<K, V> {
		return new InsertEntriesResponse<K, V>(
			this.requestId,
			existingEntries,
			this.sourceEndpointId
		);
	}
}

export class InsertEntriesResponse<K, V> {
	public readonly requestId: string;
	public readonly existingEntries: ReadonlyMap<K, V>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		existingEntries: ReadonlyMap<K, V>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.existingEntries = existingEntries;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class InsertEntriesNotification<K, V> {
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

export class EntriesInsertedNotification<K, V> {
	public constructor(
		public readonly entries: ReadonlyMap<K, V>,
		public readonly sourceEndpointId?: string,
		public readonly destinationEndpointId?: string
	) {
	}
}
