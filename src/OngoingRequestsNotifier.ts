import * as Collections from './common/Collections';
import { createLogger } from './common/logger';
import { OngoingRequestsNotification } from './messages/messagetypes/OngoingRequests';

const logger = createLogger('OngoingRequests');

export type ActiveOngoingRequest = {
	requestId: string,
	remotePeerId: string,
	storageId: string
}

export class OngoingRequestsNotifier {
	private readonly _activeOngoingRequests = new Map<string, ActiveOngoingRequest>();
	private _timer?: ReturnType<typeof setInterval>;
	
	public constructor(
		public readonly timeoutInMs: number,
		private readonly _sender: (notification: OngoingRequestsNotification) => void,
	) {
	}

	public get activeOngoingRequests(): ReadonlyMap<string, ActiveOngoingRequest> {
		return this._activeOngoingRequests;
	}

	public add(activeOngoingRequest: ActiveOngoingRequest): void {
		if (this._activeOngoingRequests.has(activeOngoingRequest.requestId)) {
			return;
		}
		this._activeOngoingRequests.set(activeOngoingRequest.requestId, activeOngoingRequest);
		if (!this._timer) {
			this._startTimer();
		}
	}

	public remove(requestId: string): boolean {
		if (!this._activeOngoingRequests.has(requestId)) {
			return false;
		}
		this._activeOngoingRequests.delete(requestId);

		if (this._activeOngoingRequests.size < 1) {
			this._stopTimer();
		}

		return true;
	}

	public clear() {
		this._activeOngoingRequests.clear();
		this._stopTimer();
	}

	private _startTimer(): void {
		if (this._timer) {
			return logger.warn('Attempted to start a timer twice');
		}
		this._timer = setInterval(() => {
			if (this._activeOngoingRequests.size < 1) {
				return (this._timer = undefined);
			}

			const remotePeerActiveRequests = Collections.groupArrayBy([ ...this._activeOngoingRequests.values() ], (item) => item.remotePeerId);

			for (const [ remotePeerId, ongoingRequests ] of remotePeerActiveRequests) {

				const notification = new OngoingRequestsNotification(
					new Set(ongoingRequests.map((item) => item.requestId)),
					remotePeerId
				);

				this._sender(notification);
				
			}
		}, this.timeoutInMs);
	}

	private _stopTimer(): void {
		if (!this._timer) {
			return;
		}
		clearInterval(this._timer);
		this._timer = undefined;
	}
}