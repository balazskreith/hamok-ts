import { setHamokLogLevel } from 'hamok';
import { run as mapInsertGet } from './map-insert-get-example';
import { run as mapUpdateIf } from './map-update-if-example';
import { run as mapEvents } from './map-events-example';
import { run as mapCatchup } from './map-catchup-example';
import { run as recordInsertGet } from './record-insert-get-example';
import { run as recordEvents } from './record-events-example';
import { run as recordDynamicCreating } from './record-dynamic-creating-example';
import { run as emitterExample } from './emitter-example';
import { run as emitterCatchup } from './emitter-catchup-example';
import { run as reelectionExample } from './common-reelection-example';
import { run as queueEvents } from './queue-events-example';
import { run as queuePushPop } from './queue-push-pop-example';
import { run as queueCatchingUp } from './queue-catching-up-example';
import { run as commonReelection } from './common-reelection-example';
import { run as commonJoinLeaveRejoin } from './common-join-leave-rejoin-example';
import { run as commonWaiting } from './common-waiting-example';
import { run as redisRemoteMap } from './redis-remote-map-example';
import { run as redisDynamicRecord } from './redis-dynamic-record-example';
import { run as redisJobExecuting } from './redis-job-executing-example';
import { run as redisRecordingJob } from './redis-recording-job-example';

import * as pino from 'pino';

const logger = pino.pino({
	name: 'election-example',
	level: 'debug',
});

async function run() {
    const examplesMap = new Map<string, () => Promise<void>>([
        // Map examples
        ['mapInsertGet', mapInsertGet],
        ['mapUpdateIf', mapUpdateIf],
        ['mapEvents', mapEvents],
        ['mapCatchup', mapCatchup],
    
        // Record examples
        ['recordInsertGet', recordInsertGet],
        ['recordEvents', recordEvents],
        ['recordDynamicCreating', recordDynamicCreating],
    
        // Emitter examples
        ['emitterExample', emitterExample],
        ['emitterCatchup', emitterCatchup],
    
        // Queue examples
        ['queueEvents', queueEvents],
        ['queuePushPop', queuePushPop],
        ['queueCatchingUp', queueCatchingUp],
    
        // Common examples
        ['commonReelection', commonReelection],
        ['commonJoinLeaveRejoin', commonJoinLeaveRejoin],
        ['commonWaiting', commonWaiting],
    ]);
    
    // Example of how to use the map
    // const selectedExample = 'mapInsertGet';
    // examplesMap.get(selectedExample)?.();
    

    if (process.argv.includes('--include-redis')) {
        // empty
        ([
            ['redisRemoteMap', redisRemoteMap],
            ['redisDynamicRecord', redisDynamicRecord],
            ['redisJobExecuting', redisJobExecuting],
            ['redisRecordingJob', redisRecordingJob],
        ] as const).forEach(([name, fn]) => examplesMap.set(name, fn));
    }

    for (const [name, fn] of examplesMap) {
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