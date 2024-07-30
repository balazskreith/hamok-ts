import { Hamok } from '@hamok-dev/hamok-ts';
import * as pino from 'pino';

const logger = pino.pino({
	name: 'fin-service',
	level: 'debug',
});

const server_1 = new Hamok()