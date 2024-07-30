import * as pino from 'pino';

const logger = pino.pino({
	name: 'hamok',
	level: 'trace',
});
const childrens = new Map<string, pino.Logger>();

export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function createLogger(moduleName: string) {

	const child = logger.child({ moduleName });

	childrens.set(moduleName, child);

	return child;
	// return console;
}

export function setLogLevel(level: LogLevel) {
	logger.level = level;
	logger.info(`Log level set to ${level}`);
	for (const child of childrens.values()) {
		child.level = level;
	}
}
