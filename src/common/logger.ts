import * as pino from 'pino';

const logger = pino.pino({
	name: 'hamok',
	level: 'warn',
});
const childs: pino.Logger[] = [];
const onChileListener = (child: pino.Logger) => {
	childs.push(child);
	child.onChild = onChileListener;
};

logger.onChild = onChileListener;

export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function createLogger(moduleName: string) {
	const child = logger.child({ moduleName });

	return child;
	// return console;
}

export function setLogLevel(level: LogLevel) {
	logger.level = level;
	logger.info(`Log level set to ${level}`);
	childs.forEach((childLogger) => (childLogger.level = logger.level));
}
