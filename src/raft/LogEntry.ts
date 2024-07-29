import { HamokMessage } from '../messages/HamokMessage';

export interface LogEntry {
	readonly index: number;
	readonly term: number;
	readonly entry: HamokMessage;
	readonly timestamp: number;
}