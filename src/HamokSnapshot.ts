export type HamokRecordSnapshot = {
	recordId: string;
	keys: Uint8Array[];
	values: Uint8Array[];
}

export type HamokMapSnapshot = {
	mapId: string;
	keys: Uint8Array[];
	values: Uint8Array[];
}

export type HamokRemoteMapSnapshot = {
	mapId: string;
	appliedCommitIndex?: number;
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
	records: HamokRecordSnapshot[];
	maps: HamokMapSnapshot[];
	queues: HamokQueueSnapshot[];
	emitters: HamokEmitterSnapshot[];
	remoteMaps: HamokRemoteMapSnapshot[];
}