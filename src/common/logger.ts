import * as pino from 'pino';

const logger = pino.pino({
	name: 'fin-service',
	level: 'warn',
});

export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function createLogger(moduleName: string) {

	return logger.child({ module: moduleName });
	// return console;
}

export function setLogLevel(level: LogLevel) {
	logger.level = level;
}
