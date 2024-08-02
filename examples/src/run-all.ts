import { setHamokLogLevel } from '@hamok-dev/hamok-ts';
import { run as reelection } from './reelection-example';
import { run as storageUpdateIf } from './storage-update-if-example';
import { run as storageInsert } from './storage-insert-get-example'
import { run as queuePushPop } from './queue-push-pop-example';
import { run as queueEvents } from './queue-events-example';
import { run as importExport } from './import-export-example';
import { run as commonWaiting } from './common-waiting-example';
import { run as storageEvents } from './storage-events-example';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'election-example',
	level: 'debug',
});

async function run() {
    const map = new Map<string, () => Promise<void>>([
        ['reelection', reelection],
        ['storageUpdateIf', storageUpdateIf],
        ['storageInsert', storageInsert],
        ['queuePushPop', queuePushPop],
        ['queueEvents', queueEvents],
        ['importExport', importExport],
        ['commonWaiting', commonWaiting],
        ['storageEvents', storageEvents],

    ]);

    for (const [name, fn] of map) {
        logger.info([
            '',
            '-'.repeat(60),
            `${' '.repeat(15)} Running ${name}`,
            '-'.repeat(60),
        ].join('\n'));
        await fn();
    }
}

if (require.main === module) {
	setHamokLogLevel('info');
	run();
}