import * as pino from 'pino';

export const logger = pino.pino({
	name: 'fin-service',
	level: 'silent',
});

export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function createLogger(moduleName: string) {

	return logger.child({ module: moduleName });
	// return console;
}
