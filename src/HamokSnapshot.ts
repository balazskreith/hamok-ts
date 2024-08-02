export type HamokStorageSnapshot = {
	storageId: string;
	keys: Uint8Array[];
	values: Uint8Array[];
}

export type HamokQueueSnapshot = {
	queueId: string;
	keys: Uint8Array[];
	values: Uint8Array[];
}

export type HamokEmitterSnapshot = {
	emitterId: string;
	events: string[];
	subscribers: string[][];
}

export type HamokSnapshot = {
	meta: {
		peerId: string;
		created: number;
	},
	commitIndex: number;
	term: number;
	storages: HamokStorageSnapshot[];
}