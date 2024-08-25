import { setHamokLogLevel } from 'hamok';
import { run as reelection } from './common-reelection-example';
import { run as discovery } from './common-join-leave-rejoin-example';
import { run as mapUpdateIf } from './map-update-if-example';
import { run as mapInsert } from './map-insert-get-example'
import { run as queuePushPop } from './queue-push-pop-example';
import { run as queueEvents } from './queue-events-example';
import { run as importExport } from './common-import-export-example';
import { run as commonWaiting } from './common-waiting-example';
import { run as mapEvents } from './map-events-example';
import { run as recordInsertGet } from './record-insert-get-example';
import { run as recordEvents } from './record-events-example';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'election-example',
	level: 'debug',
});

async function run() {
    const map = new Map<string, () => Promise<void>>([
        ['mapInsert', mapInsert],
        ['mapUpdateIf', mapUpdateIf],
        ['mapEvents', mapEvents],
        
        ['queuePushPop', queuePushPop],
        ['queueEvents', queueEvents],

        ['recordInsertGet', recordInsertGet],
        ['recordEvents', recordEvents],
        
        ['importExport', importExport],
        ['commonWaiting', commonWaiting],
        ['reelection', reelection],
        ['discovery', discovery],
    ]);

    if (process.argv.includes('--include-redis')) {
        // empty
    }

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