export class RemoveSubscriptionRequest {
	public readonly requestId: string;
	public readonly event: string;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		event: string,
		sourceEndpointId?: string
	) {
		this.requestId = requetId;
		this.event = event;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse(success: boolean): RemoveSubscriptionResponse {
		return new RemoveSubscriptionResponse(
			this.requestId,
			success,
			this.sourceEndpointId!
		);
	}
}

export class RemoveSubscriptionResponse {
	public readonly requestId: string;
	public readonly success: boolean;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		success: boolean,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.success = success;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class RemoveSubscriptionNotification {
	public readonly event: string;
	public readonly sourceEndpointId?: string;
	public readonly destinationEndpointId?: string;
	public constructor(
		event: string,
		sourceEndpointId?: string,
		destinationEndpointId?: string
	) {
		this.event = event;
		this.sourceEndpointId = sourceEndpointId;
		this.destinationEndpointId = destinationEndpointId;
	}
}
