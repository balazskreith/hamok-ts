export class GetKeysRequest {
	public readonly requestId: string;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		sourceEndpointId?: string
	) {
		this.requestId = requetId;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse<K>(
		keys: ReadonlySet<K>
	): GetKeysResponse<K> {
		return new GetKeysResponse<K>(
			this.requestId,
			keys,
			this.sourceEndpointId
		);
	}
}

export class GetKeysResponse<K> {
	public readonly requestId: string;
	public readonly keys: ReadonlySet<K>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		keys: ReadonlySet<K>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.keys = keys;
		this.destinationEndpointId = destinationEndpointId;
	}
}
