import { HamokMessage } from '../HamokMessage';

export class SubmitMessageRequest {
	public readonly requestId: string;
	public readonly sourceEndpointId?: string;
	public readonly entry: HamokMessage;
	public readonly destinationEndpointId?: string;
	public constructor(
		requetId: string,
		sourceEndpointId: string,
		entry: HamokMessage,
		destinationEndpointId?: string,
	) {
		this.requestId = requetId;
		this.sourceEndpointId = sourceEndpointId;
		this.entry = entry;
		this.destinationEndpointId = destinationEndpointId;
	}

	public createResponse(
		success: boolean,
		leaderId?: string,
	): SubmitMessageResponse {
		return new SubmitMessageResponse(
			this.requestId,
			success,
			this.sourceEndpointId,
			leaderId,
		);
	}
}

export class SubmitMessageResponse {
	public readonly requestId: string;
	public readonly success: boolean;
	public readonly destinationEndpointId?: string;
	public readonly leaderId?: string;
	public constructor(
		requestId: string,
		success: boolean,
		destinationId?: string,
		leaderId?: string,
	) {
		this.requestId = requestId;
		this.success = success;
		this.destinationEndpointId = destinationId;
		this.leaderId = leaderId;
	}
}
