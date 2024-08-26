import { Hamok,  HamokMessage } from 'hamok';

export class HamokMessageHub {
	private readonly _listeners = new Map<string, Hamok>();

	constructor() {
		this.send = this.send.bind(this);
	}

	add(...hamoks: Hamok[]) {
		hamoks.forEach(hamok => {
			this._listeners.set(hamok.localPeerId, hamok);
			hamok.on('message', this.send);
		});
	}

	remove(...hamoks: Hamok[]) {
		hamoks.forEach(hamok => {
			this._listeners.delete(hamok.localPeerId);
			hamok.off('message', this.send);
		});
	}

	send(message: HamokMessage) {
		for (const hamok of this._listeners.values()) {
			hamok.accept(message);
		}
	}
}
