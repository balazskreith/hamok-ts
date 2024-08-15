export class JoinNotification {

	public constructor(
		public readonly sourcePeerId: string,
		public readonly destinationPeerId?: string,
	) {
	}
}