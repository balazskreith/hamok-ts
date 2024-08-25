export class StorageStateNotification {
	
	public constructor(
		public readonly sourceEndpointId: string,
		public readonly serializedStorageSnapshot: string,
		public readonly commitIndex: number,
	) {
		// empty
	}
}