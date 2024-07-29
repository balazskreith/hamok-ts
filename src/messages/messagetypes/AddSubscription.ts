export class AddSubscriptionRequest {
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

	public createResponse(success: boolean): AddSubscriptionResponse {
		return new AddSubscriptionResponse(
			this.requestId,
			success,
			this.sourceEndpointId!
		);
	}
}

export class AddSubscriptionResponse {
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

export class AddSubscriptionNotification {
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
