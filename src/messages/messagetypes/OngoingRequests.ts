export class OngoingRequestsNotification {
	public constructor(
		public readonly requestIds: ReadonlySet<string>,
		public readonly destinationEndpointId?: string,
	) {
		// empty
	}
}