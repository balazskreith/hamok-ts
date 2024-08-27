export type HamokRecordSnapshot = {
	recordId: string;
	keys: Uint8Array[];
	values: Uint8Array[];
}

export type HamokMapSnapshot = {
	mapId: string;
	keys: string[];
	values: string[];
}

export type HamokRemoteMapSnapshot = {
	mapId: string;
	appliedCommitIndex: number;
}

export type HamokQueueSnapshot = {
	queueId: string;
	keys: string[];
	values: string[];
}

export type HamokEmitterSnapshot = {
	emitterId: string;
	events: string[];
	subscribers: string[][];
}
