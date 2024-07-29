export class EndpointStatesNotification {
	public readonly sourceEndpointId: string;
	public readonly destinationEndpointId: string;
	public readonly term: number;
	public readonly commitIndex: number;
	public readonly leaderNextIndex: number;
	public readonly numberOfLogs: number;
	public readonly activeEndpointIds?: ReadonlySet<string>;
	public constructor(
		sourceEndpointId: string,
		destinationEndpointId: string,
		term: number,
		commitIndex: number,
		leaderNextIndex: number,
		numberOfLogs: number,
		activeEndpointIds?: ReadonlySet<string>,
	) {
		this.sourceEndpointId = sourceEndpointId;
		this.destinationEndpointId = destinationEndpointId;
		this.term = term;
		this.commitIndex = commitIndex;
		this.leaderNextIndex = leaderNextIndex;
		this.numberOfLogs = numberOfLogs;
		this.activeEndpointIds = activeEndpointIds;
	}
}