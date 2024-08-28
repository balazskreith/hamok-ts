export class StorageStateNotification {
	
	public constructor(
		public readonly sourceEndpointId: string,
		public readonly commitIndex: number,
		public readonly serializedStorageSnapshot?: string,
	) {
		// empty
	}
}