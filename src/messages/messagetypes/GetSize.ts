export class GetSizeRequest {
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
		size: number
	): GetSizeResponse {
		return new GetSizeResponse(
			this.requestId,
			size,
			this.sourceEndpointId
		);
	}
}

export class GetSizeResponse {
	public readonly requestId: string;
	public readonly size: number;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		size: number,
		destinationEndpointId?: string
	) {
		this.requestId = requetId;
		this.size = size;
		this.destinationEndpointId = destinationEndpointId;
	}
}
