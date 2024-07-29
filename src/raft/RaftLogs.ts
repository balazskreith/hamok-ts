import { createLogger } from '../common/logger';
import { HamokMessage } from '../messages/HamokMessage';
import { LogEntry } from './LogEntry';

const logger = createLogger('RaftLogs');

export class RaftLogs {
    
	/**
     * index of highest log entry applied to state
     * machine (initialized to 0, increases
     * monotonically)
     */
	private _lastApplied = 0;
    
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
    
	private _expirationTimeInMs: number;
	private _entries: Map<number, LogEntry>;
	private _mssingEntriesLogged = false;

	public constructor(
		entries: Map<number, LogEntry>, 
		expirationTimeInMs?: number
	) {
		this._entries = entries;
		this._expirationTimeInMs = expirationTimeInMs ?? 0;
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

	public get lastAppliedIndex(): number {
		return this._lastApplied;
	}

	public get size(): number {
		return this._entries.size;
	}

	public commitUntil(newCommitIndex: number): Readonly<LogEntry[]> {
		if (newCommitIndex <= this._commitIndex) {
			logger.warn(`Requested to commit until 
                ${newCommitIndex} index, but the actual commitIndex is 
                ${this._commitIndex}`
			);
			
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

			if (logEntry == undefined) {
				logger.warn(`LogEntry for nextCommitIndex ${nextCommitIndex} is null. it supposed not to be null.`);
				break;
			}
			this._commitIndex = nextCommitIndex;
			committedEntries.push(logEntry);
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
		
		return oldLogEntry;
	}

	public compareAndAdd(
		expectedNextIndex: number,
		term: number,
		entry: HamokMessage,
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

		this._entries.set(logEntry.index, logEntry);
		++this._nextIndex;
		
		return true;
	}

	public get(index: number): LogEntry | undefined {
		return this._entries.get(index);
	}

	public collectEntries(startIndex: number): HamokMessage[] {
		const result: HamokMessage[] = [];
		let missingEntries = 0;

		for (let logIndex = startIndex; logIndex < this._nextIndex; ++logIndex) {
			const logEntry = this._entries.get(logIndex);

			if (logEntry == undefined) {
				// we don't have it anymore
				++missingEntries;
				continue;
			}
			result.push(logEntry.entry);
		}
		if (0 < missingEntries) {
			if (!this._mssingEntriesLogged) {
				logger.warn('Requested to collect entries, startIndex: {}, endIndex: {}, but missing {} entries probably in the beginning. The other peer should request a commit sync', startIndex, this.nextIndex, missingEntries);
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
		this._lastApplied = newCommitIndex;
        
		logger.info(`Logs are reset. new values: 
            commitIndex: ${this._commitIndex}, 
            nextIndex: ${this._nextIndex}, 
            lastApplied: ${this._lastApplied}`
		);
	}

	private _expire(): void {
		if (this._expirationTimeInMs < 1) {
			// infinite
			return;
		}
		const thresholdInMs = Date.now() - this._expirationTimeInMs;
		let expiredLogIndex = -1;

		for (let index = this._lastApplied; index < this.commitIndex; ++index) {
			const logEntry = this._entries.get(index);

			if (logEntry == undefined) {
				// already purged?
				logger.info(`LastApplied is set to 
                    ${index + 1}, because for index 
                    ${index} logEntry does not exists`
				);
				this._lastApplied = index + 1;
				continue;
			}
			if (thresholdInMs <= logEntry.timestamp) {
				break;
			}
			expiredLogIndex = index;
		}
		if (expiredLogIndex < 0) {
			return;
		}
		if (this._nextIndex <= expiredLogIndex || expiredLogIndex < this._lastApplied) {
			return;
		}
		if (this._commitIndex < expiredLogIndex) {
			logger.warn('expired log index is higher than the commit index. This is a problem! increase the expiration timeout, because it leads to a potential inconsistency issue.');
		}
		let removed = 0;

		for (let index = this._lastApplied; index < expiredLogIndex; ++index) {
			if (this._entries.delete(index)) {
				// logger.warn("Removed entry index", index);
				++removed;
			}
		}
		this._lastApplied = expiredLogIndex;
		logger.trace(`Set the lastApplied to ${this._lastApplied} and removed ${removed} items`);
	}
}