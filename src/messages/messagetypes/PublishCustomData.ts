export class PublishCustomDataRequest {
	public readonly requestId: string;
	public readonly event: string;
	public readonly customData: Uint8Array;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		event: string,
		customData: Uint8Array,
		sourceEndpointId?: string,
	) {
		this.requestId = requetId;
		this.event = event;
		this.customData = customData;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse(
		success: boolean
	): PublishCustomDataResponse {
		return new PublishCustomDataResponse(
			this.requestId,
			success,
			this.sourceEndpointId
		);
	}
}

export class PublishCustomDataResponse {
	public readonly requestId: string;
	public readonly success: boolean;
	public readonly destinationEndpointId?: string;
	public constructor(
		requestId: string,
		success: boolean,
		destinationEndpointId?: string
	) {
		this.requestId = requestId;
		this.success = success;
		this.destinationEndpointId = destinationEndpointId;
	}
}

export class PublishCustomDataNotification {
	public readonly sourceEndpointId?: string;
	public readonly event: string;
	public readonly customData: Uint8Array;
	public readonly destinationEndpointId?: string;
	public constructor(
		event: string,
		customData: Uint8Array,
		sourceEndpointId?: string,
		destinationEndpointId?: string,
	) {
		this.sourceEndpointId = sourceEndpointId;
		this.event = event;
		this.customData = customData;
		this.destinationEndpointId = destinationEndpointId;
	}
}
