export class OngoingRequestsNotification {
	public readonly requestIds: ReadonlySet<string>;
	public readonly destinationEndpointId?: string;
	public constructor(
		requestIds: ReadonlySet<string>,
		destinationEndpointId?: string
	) {
		this.requestIds = requestIds;
		this.destinationEndpointId = destinationEndpointId;
	}
}