export class EndpointStatesNotification {

	public constructor(
		public readonly sourceEndpointId: string,
		public readonly destinationEndpointId: string,
		public readonly term: number,
		public readonly commitIndex: number,
		public readonly leaderNextIndex: number,
		public readonly numberOfLogs: number,
		public readonly activeEndpointIds?: ReadonlySet<string>,
		public readonly snapshot?: string,
		public readonly requestId?: string,
	) {
	}
}