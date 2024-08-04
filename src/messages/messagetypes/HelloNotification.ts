export class HelloNotification {

	public constructor(
		public readonly sourcePeerId: string,
		public readonly destinationPeerId?: string,
		public readonly raftLeaderId?: string,
		public readonly customData?: string
	) {
	}
}