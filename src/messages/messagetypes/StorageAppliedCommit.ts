export class StorageAppliedCommitNotification {
	
	public constructor(
		public readonly appliedCommitIndex: number,
		public readonly sourceEndpointId?: string,
	) {
		// empty
	}
}