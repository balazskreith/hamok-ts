export class HelloNotification {
	public readonly sourcePeerId: string;
	public readonly destinationPeerId?: string;
	public readonly raftLeaderId?: string;
	public constructor(
		sourcePeerId: string, 
		destinationPeerId?: string,
		raftLeaderId?: string
	) {
		this.sourcePeerId = sourcePeerId;
		this.destinationPeerId = destinationPeerId;
		this.raftLeaderId = raftLeaderId;
	}
}