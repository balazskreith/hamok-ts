export class GetSubscriptionsRequest {
	public readonly requestId: string;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		sourceEndpointId?: string
	) {
		this.requestId = requetId;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse(
		subscriptions: Map<string, ReadonlySet<string>>
	): GetSubscriptionsResponse {
		return new GetSubscriptionsResponse(
			this.requestId,
			subscriptions,
			this.sourceEndpointId
		);
	}
}

export class GetSubscriptionsResponse {
	public readonly requestId: string;
	public readonly subscriptions: Map<string, ReadonlySet<string>>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		subscriptions: Map<string, ReadonlySet<string>>,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.subscriptions = subscriptions;
		this.destinationEndpointId = destinationEndpointId;
	}
}
