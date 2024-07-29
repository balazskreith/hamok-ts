export class SyncedProperties {
	/* Persistent state on all servers: */
	/**
     * latest term server has seen (initialized to 0
     * on first boot, increases monotonically)
     */
	public currentTerm = 0;
	// public get currentTerm(): number {
	// 	return this._currentTerm;
	// }

	// public set currentTerm(value: number) {
	// 	if (value < this._currentTerm) {
	// 		logger.warn('Set current term smaller than the term stored before');
	// 	}
	// 	this._currentTerm = value;
	// }

	/* Volatile state on all servers: */
	/**
     * candidateId that received vote in current
     * term (or null if none)
     */
	public votedFor?: string;

	/**
     * index of highest log entry applied to state
     * machine (initialized to 0, increases
     * monotonically)
     */
	public lastApplied = 0;

	/* Volatile state on leaders (Reinitialized after election): */
	/**
     * for each server, index of the next log entry
     * to send to that server (initialized to leader
     * last log index + 1)
     */
	public readonly nextIndex = new Map<string, number>();

	/**
     * for each server, index of highest log entry
     * known to be replicated on server
     * (initialized to 0, increases monotonically)
     */
	public readonly matchIndex = new Map<string, number>();

}