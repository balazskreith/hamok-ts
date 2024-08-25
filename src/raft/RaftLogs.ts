import { createLogger } from '../common/logger';
import { HamokMessage } from '../messages/HamokMessage';
import { LogEntry } from './LogEntry';

export const logger = createLogger('RaftLogs');

export type RaftLogsEventMap = {
	committed: [commitIndex: number, message: HamokMessage];
	removed: [commitIndex: number, message: HamokMessage];
}

export type MemoryStoredRaftLogsConfig = {
	expirationTimeInMs: number;
	memorySizeHighWaterMark: number;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging

export interface RaftLogs {
	readonly commitIndex: number;
	readonly nextIndex: number;
	readonly firstIndex: number;
	readonly size: number;
	readonly bytesInMemory: number;
	commitUntil(newCommitIndex: number): Readonly<LogEntry[]>;
	submit(term: number, entry: HamokMessage): number;
	compareAndOverride(index: number, expectedTerm: number, entry: HamokMessage): LogEntry | undefined;
	compareAndAdd(expectedNextIndex: number, term: number, entry: HamokMessage): boolean;
	removeUntil(index: number): void;
	get(index: number): LogEntry | undefined;
	collectEntries(startIndex: number, endIndex?: number): HamokMessage[];
	[Symbol.iterator](): IterableIterator<LogEntry>;
	reset(newCommitIndex: number): void;

	on<U extends keyof RaftLogsEventMap>(event: U, listener: (...args: RaftLogsEventMap[U]) => void): this;
	once<U extends keyof RaftLogsEventMap>(event: U, listener: (...args: RaftLogsEventMap[U]) => void): this;
	off<U extends keyof RaftLogsEventMap>(event: U, listener: (...args: RaftLogsEventMap[U]) => void): this;
}
