import { EventEmitter } from 'events';
import { HamokMessage } from '../messages/HamokMessage';
import { LogEntry } from './LogEntry';
import { RaftLogs, logger } from './RaftLogs';

export type MemoryStoredRaftLogsEventMap = {
	committed: [commitIndex: number, message: HamokMessage];
	expired: [commitIndex: number, message: HamokMessage];
	removed: [commitIndex: number, message: HamokMessage];
	highWaterMark: [memorySize: number];
}

export type MemoryStoredRaftLogsConfig = {
	expirationTimeInMs: number;
	memorySizeHighWaterMark: number;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface MemoryStoredRaftLogs {
	on<U extends keyof MemoryStoredRaftLogsEventMap>(event: U, listener: (...args: MemoryStoredRaftLogsEventMap[U]) => void): this;
	once<U extends keyof MemoryStoredRaftLogsEventMap>(event: U, listener: (...args: MemoryStoredRaftLogsEventMap[U]) => void): this;
	off<U extends keyof MemoryStoredRaftLogsEventMap>(event: U, listener: (...args: MemoryStoredRaftLogsEventMap[U]) => void): this;
	emit<U extends keyof MemoryStoredRaftLogsEventMap>(event: U, ...args: MemoryStoredRaftLogsEventMap[U]): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MemoryStoredRaftLogs extends EventEmitter implements RaftLogs {

	/**
	 * index of highest log entry applied to state
	 * machine (initialized to 0, increases
	 * monotonically)
	 */
	private _firstIndex = 0;

	/**
	 * The next log index
	 */
	private _nextIndex = 0;

	/**
	 * index of highest log entry known to be
	 * committed (initialized to 0, increases
	 * monotonically)
	 */
	private _commitIndex = -1;

	private _mssingEntriesLogged = false;

	private _memoryEstimateBytesLength = 0;

	private readonly _entries: Map<number, LogEntry>;

	public constructor(
		public readonly config: MemoryStoredRaftLogsConfig,
		entries?: Map<number, LogEntry>,
	) {
		super();
		this.setMaxListeners(Infinity);
		this._entries = entries ?? new Map();
	}

	/**
	 * index of highest log entry known to be
	 * committed (initialized to 0, increases
	 * monotonically)
	 */
	public get commitIndex(): number {
		return this._commitIndex;
	}

	/**
	 * The next index for the logs to be used if an entry is added or submitted
	 * @return
	 */
	public get nextIndex(): number {
		return this._nextIndex;
	}

	public get firstIndex(): number {
		return this._firstIndex;
	}

	public get size(): number {
		return this._entries.size;
	}

	public get bytesInMemory(): number {
		return this._memoryEstimateBytesLength;
	}

	public commitUntil(newCommitIndex: number): Readonly<LogEntry[]> {
		if (newCommitIndex <= this._commitIndex) {
			logger.warn('Requested to commit until %d index, but the actual commitIndex is %d', newCommitIndex, this._commitIndex);

			return [];
		}
		const committedEntries: LogEntry[] = [];

		while (this._commitIndex < newCommitIndex) {
			if (this._nextIndex <= this._commitIndex + 1) {
				logger.warn(`Cannot commit, because there is no next entry to commit. commitIndex: 
                    ${this._commitIndex}, 
                    nextIndex: ${this._nextIndex}, 
                    newCommitIndex: ${newCommitIndex}`
				);
				break;
			}
			const nextCommitIndex = this._commitIndex + 1;
			const logEntry = this._entries.get(nextCommitIndex);

			logger.trace('Committing log entry for index %d, %o', nextCommitIndex, logEntry);

			if (logEntry == undefined) {
				logger.warn(`LogEntry for nextCommitIndex ${nextCommitIndex} is null. it supposed not to be null.`);
				break;
			}
			this._commitIndex = nextCommitIndex;
			committedEntries.push(logEntry);

			this.emit('committed', this._commitIndex, logEntry.entry);
		}
		if (0 < committedEntries.length) {
			this._expire();
		}

		return committedEntries;
	}

	public submit(term: number, entry: HamokMessage): number {
		const now = Date.now();
		const logEntry: LogEntry = {
			index: this._nextIndex,
			term,
			entry,
			timestamp: now,
		};

		this._entries.set(logEntry.index, logEntry);
		++this._nextIndex;

		this._memoryEstimateBytesLength += entry.values.length + entry.keys.length;
		if (0 < this.config.memorySizeHighWaterMark && this.config.memorySizeHighWaterMark < this._memoryEstimateBytesLength) {
			this.emit('highWaterMark', this._memoryEstimateBytesLength);
		}
		
		return logEntry.index;
	}

	public compareAndOverride(
		index: number,
		expectedTerm: number,
		entry: HamokMessage
	): LogEntry | undefined {
		if (this.nextIndex <= index) {
			return;
		}
		const now = Date.now();
		const oldLogEntry = this._entries.get(index);

		if (oldLogEntry == undefined) {
			const newLogEntry: LogEntry = {
				index,
				term: expectedTerm,
				entry,
				timestamp: now,
			};

			this._entries.set(newLogEntry.index, newLogEntry);

			this._memoryEstimateBytesLength += entry.values.length + entry.keys.length;

			return;
		}
		if (expectedTerm == oldLogEntry.term) {
			// theoretically identical
			return;
		}
		const newLogEntry: LogEntry = {
			index,
			term: expectedTerm,
			entry,
			timestamp: now,
		};

		this._entries.set(newLogEntry.index, newLogEntry);

		this._memoryEstimateBytesLength -= oldLogEntry.entry.values.length + oldLogEntry.entry.keys.length;
		this._memoryEstimateBytesLength += entry.values.length + entry.keys.length;

		return oldLogEntry;
	}

	public compareAndAdd(
		expectedNextIndex: number,
		term: number,
		entry: HamokMessage
	): boolean {
		if (this._nextIndex != expectedNextIndex) {
			return false;
		}
		const logEntry: LogEntry = {
			index: this._nextIndex,
			term,
			entry,
			timestamp: Date.now(),
		};

		this._memoryEstimateBytesLength += entry.values.length + entry.keys.length;
		this._entries.set(logEntry.index, logEntry);
		++this._nextIndex;

		return true;
	}

	public get(index: number): LogEntry | undefined {
		return this._entries.get(index);
	}

	public collectEntries(startIndex: number, endIndex?: number): LogEntry[] {
		const result: LogEntry[] = [];
		let missingEntries = 0;

		if (endIndex == undefined) {
			endIndex = this._nextIndex;
		} else if (endIndex < startIndex) {
			logger.warn('Requested to collect entries, startIndex: %d, endIndex: %d, but endIndex is smaller than startIndex.', startIndex, endIndex);
			
			return [];
		} else if (this._nextIndex < endIndex) {
			logger.warn('Requested to collect entries, startIndex: %d, endIndex: %d, but endIndex is higher than the nextIndex.', startIndex, endIndex);
			
			endIndex = this._nextIndex;
		} else {
			endIndex = Math.min(endIndex, this._nextIndex);
		}

		for (let logIndex = startIndex; logIndex < endIndex; ++logIndex) {
			const logEntry = this._entries.get(logIndex);

			if (logEntry == undefined) {
				// we don't have it anymore
				++missingEntries;
				continue;
			}
			result.push(logEntry);
		}
		if (0 < missingEntries) {
			if (!this._mssingEntriesLogged) {
				logger.warn('Requested to collect entries, startIndex: %d, endIndex: %d, but missing %d entries.', startIndex, this.nextIndex, missingEntries);
				this._mssingEntriesLogged = true;
			}
		} else if (this._mssingEntriesLogged) {
			this._mssingEntriesLogged = false;
		}

		return result;
	}

	/**
	 * Direct iterator for the logs. Starts with commitIndex + 1, and iterates the logs until nextIndex.
	 * if a log is comitted after this iterator has been created but before the next is called on this iterator
	 * @return
	 */
	public *[Symbol.iterator](): IterableIterator<LogEntry> {
		for (let index = this._commitIndex + 1; index < this._nextIndex; ++index) {
			const logEntry = this._entries.get(index);

			if (logEntry) {
				yield logEntry;
			}
		}
	}

	public reset(newCommitIndex: number) {
		this._entries.clear();
		this._commitIndex = newCommitIndex;
		this._nextIndex = newCommitIndex + 1;
		this._firstIndex = newCommitIndex;
		this._memoryEstimateBytesLength = 0;

		logger.warn(`Logs are reset. new values: commitIndex: ${this._commitIndex}, nextIndex: ${this._nextIndex}, lastApplied: ${this._firstIndex}`);
	}

	public removeUntil(newFirstIndex: number): void {
		if (newFirstIndex <= this._firstIndex) {
			return;
		} else if (this._commitIndex <= newFirstIndex) {
			return logger.warn('Requested to remove until index {}, but the commitIndex is {}.', newFirstIndex, this._commitIndex);
		}
		let removed = 0;

		for (let index = this._firstIndex; index < this.commitIndex; ++index) {
			const logEntry = this._entries.get(index);

			if (logEntry == undefined || !this._entries.delete(index)) {
				// already purged?
				logger.trace(`LastApplied is set to ${index + 1}, because for index ${index} logEntry does not exists`);
				this._firstIndex = index + 1;
				continue;
			}

			this._memoryEstimateBytesLength -= logEntry.entry.values.length + logEntry.entry.keys.length;
			++removed;
			this.emit('removed', index, logEntry.entry);
		}
		
		this._firstIndex = newFirstIndex;
		logger.trace(`Set the lastApplied to ${this._firstIndex} and removed ${removed} items`);
	}

	private _expire(): void {
		if (this.config.expirationTimeInMs < 1) {
			// infinite
			return;
		}
		logger.trace('Expiring logs %o', this.config);

		const thresholdInMs = Date.now() - this.config.expirationTimeInMs;
		let expiredLogIndex = -1;

		for (let index = this._firstIndex; index < this.commitIndex; ++index) {
			const logEntry = this._entries.get(index);

			if (logEntry == undefined) {
				// already purged?
				logger.trace(`LastApplied is set to 
                    ${index + 1}, because for index 
                    ${index} logEntry does not exists`
				);
				this._firstIndex = index + 1;
				continue;
			}
			logger.trace('Log %d created at %d, elapsedMs %d threshold %d', index, logEntry.timestamp, Date.now() - logEntry.timestamp, thresholdInMs);
			if (thresholdInMs <= logEntry.timestamp) {
				break;
			}
			expiredLogIndex = index;
		}

		logger.trace('Expired log index is %d', expiredLogIndex);
		if (expiredLogIndex < 0) {
			return;
		}
		logger.trace('nextIndex %d, expiredLogIndex %d, firstIndex %d', this._nextIndex, expiredLogIndex, this._firstIndex);
		if (this._nextIndex <= expiredLogIndex || expiredLogIndex < this._firstIndex) {
			return;
		}
		if (this._commitIndex < expiredLogIndex) {
			logger.warn('expired log index is higher than the commit index. This is a problem! increase the expiration timeout, because it leads to a potential inconsistency issue.');
		}
		let removed = 0;

		for (let index = this._firstIndex; index < expiredLogIndex; ++index) {
			const logEntry = this._entries.get(index);

			if (this._entries.delete(index)) {
				// logger.warn("Removed entry index", index);
				++removed;

				if (logEntry) {
					this._memoryEstimateBytesLength -= logEntry.entry.values.length + logEntry.entry.keys.length;
					
					this.emit('expired', index, logEntry.entry);
					this.emit('removed', index, logEntry.entry);
				}
				
			}
		}
		this._firstIndex = expiredLogIndex;
		logger.trace(`Set the lastApplied to ${this._firstIndex} and removed ${removed} items`);
	}
}
