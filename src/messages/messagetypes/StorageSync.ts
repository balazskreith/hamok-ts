export class StorageSyncRequest {
	public readonly requestId: string;
	public readonly leaderId?: string;
	public readonly sourceEndpointId?: string;
	public constructor(
		requetId: string,
		leaderId?: string,
		sourceEndpointId?: string,
	) {
		this.requestId = requetId;
		this.leaderId = leaderId;
		this.sourceEndpointId = sourceEndpointId;
	}

	public createResponse(
		leaderId: string,
		numberOfLogs?: number,
		lastApplied?: number,
		commitIndex?: number,
	): StorageSyncResponse {
		return new StorageSyncResponse(
			this.requestId,
			this.sourceEndpointId!,
			leaderId,
			numberOfLogs,
			lastApplied,
			commitIndex,
		);
	}
}

export class StorageSyncResponse {
	public readonly requestId: string;
	public readonly destinationId: string;
	public readonly leaderId: string;
	public readonly numberOfLogs?: number;
	public readonly lastApplied?: number;
	public readonly commitIndex?: number;
	public constructor(
		requestId: string,
		destinationId: string,
		leaderId: string,
		numberOfLogs?: number,
		lastApplied?: number,
		commitIndex?: number,
	) {
		this.requestId = requestId;
		this.leaderId = leaderId;
		this.numberOfLogs = numberOfLogs;
		this.lastApplied = lastApplied;
		this.commitIndex = commitIndex;
		this.destinationId = destinationId;
	}
}
