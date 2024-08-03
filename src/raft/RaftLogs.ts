import { createLogger } from '../common/logger';
import { HamokMessage } from '../messages/HamokMessage';
import { LogEntry } from './LogEntry';

export const logger = createLogger('RaftLogs');

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
	collectEntries(startIndex: number): HamokMessage[];
	[Symbol.iterator](): IterableIterator<LogEntry>;
	reset(newCommitIndex: number): void;
}
