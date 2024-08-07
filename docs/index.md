Hamok User Manual
---

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [API Reference](#api-reference)
   - [Hamok Class](#hamok-class)
   - [Creating and Managing Maps](#creating-and-managing-maps)
   - [Creating and Managing Records](#creating-and-managing-records)
   - [Creating and Managing Queues](#creating-and-managing-queues)
   - [Creating and Managing Emitters](#creating-and-managing-emitters)
5. [Events](#events)
6. [Snapshots](#snapshots)
7. [Error Handling](#error-handling)
8. [Examples](#examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)
11. [FAQ](#faq)

## Introduction

Hamok is a lightweight, distributed object storage library developed using [Raft](https://raft.github.io/) consensus 
algorithm. 

## Installation
To install Hamok, ensure you have Node.js installed, and then add Hamok to your project via npm or yarn:

```sh
npm install hamok
```

or

```sh
yarn add hamok
```

## Creating a Hamok Instance

To create a new Hamok instance, import the `Hamok` class and instantiate it:

```typescript
import { Hamok } from 'hamok';

const hamok = new Hamok();
```

## Configuration

Hamok can be configured using the `HamokConstructorConfig` type. Here is an example configuration:

```typescript
import { Hamok } from 'hamok';

const config = {

	/**
	 * The unique identifier for the peer in the Raft cluster.
	 */
	peerId: 'peer-1',

	/**
	 * The timeout duration in milliseconds for elections.
	 * If an election has not been completed within this duration, a  candidate change state to follower.
	 */
	electionTimeoutInMs: 3000,

	/**
	 * The maximum idle time in milliseconds for a follower.
	 * If the follower is idle for longer than this duration, it considers the leader to be unavailable and starts an election.
	 */
	followerMaxIdleInMs: 500,

	/**
	 * The interval in milliseconds at which heartbeats are sent by the leader to maintain authority over followers,
	 * and sending the logs.
	 */
	heartbeatInMs: 150,

	/**
	 * If true, this peer will only be a follower and will never become a candidate or leader.
	 */
	onlyFollower: false,
};

const hamok = new Hamok(config);
```

## API Reference

### Hamok Class
The `Hamok` class is the main entry point for using the Hamok library.

### Events
Hamok emits various events that can be listened to for handling specific actions.

- `started`: Emitted when the Hamok instance starts.
- `stopped`: Emitted when the Hamok instance stops.
- `follower`: Emitted when the instance becomes a follower.
- `leader`: Emitted when the instance becomes the leader.
- `message`: Emitted when a message is received.
- `remote-peer-joined`: Emitted when a remote peer joins.
- `remote-peer-left`: Emitted when a remote peer leaves.
- `leader-changed`: Emitted when the leader changes.
- `state-changed`: Emitted when the state changes.
- `commit`: Emitted when a commit occurs.
- `heartbeat`: Emitted during heartbeats.
- `error`: Emitted when an error occurs.
- `hello-notification`: Emitted when a hello notification is received.
- `no-heartbeat-from`: Emitted when no heartbeat is received from a peer.

```typescript
hamok.on('started', () => console.log('Hamok instance started'));
hamok.on('stopped', () => console.log('Hamok instance stopped'));
hamok.on('follower', () => console.log('Instance is now a follower'));
hamok.on('leader', () => console.log('Instance is now the leader'));
hamok.on('message', (message) => console.log('Message received:', message));
hamok.on('remote-peer-joined', (peerId) => console.log('Remote peer joined:', peerId));
hamok.on('remote-peer-left', (peerId) => console.log('Remote peer left:', peerId));
hamok.on('leader-changed', (leaderId) => console.log('Leader changed:', leaderId));
hamok.on('state-changed', (state) => console.log('State changed:', state));
hamok.on('commit', (commitIndex) => console.log('Commit occurred:', commitIndex));
hamok.on('heartbeat', () => console.log('Heartbeat received'));
hamok.on('error', (error) => console.error('An error occurred:', error));
hamok.on('hello-notification', (peerId) => console.log('Hello notification received from:', peerId));
hamok.on('no-heartbeat-from', (peerId) => console.log('No heartbeat received from:', peerId));
```

### Constructor
```typescript
new Hamok(providedConfig?: Partial<HamokConstructorConfig>);
```

### Methods
- `start(): void`: Starts the Hamok instance.
- `stop(): void`: Stops the Hamok instance.
- `addRemotePeerId(remoteEndpointId: string): void`: Adds a remote peer to the cluster.
- `removeRemotePeerId(remoteEndpointId: string): void`: Removes a remote peer from the cluster.
- `export(): HamokSnapshot`: Exports the current state of the Hamok instance.
- `import(snapshot: HamokSnapshot): void`: Imports a snapshot into the Hamok instance.
- `waitUntilCommitHead(): Promise<void>`: Waits until the commit head is reached.
- `createMap<K, V>(options: HamokMapBuilderConfig<K, V>): HamokMap<K, V>`: Creates a new map.
- `createRecord<T extends HamokRecordObject>(options: HamokRecordBuilderConfig<T>): HamokRecord<T>`: Creates a new record.
- `createQueue<T>(options: HamokQueueBuilderConfig<T>): HamokQueue<T>`: Creates a new queue.
- `createEmitter<T extends HamokEmitterEventMap>(options: HamokEmitterBuilderConfig<T>): HamokEmitter<T>`: Creates a new emitter.
- `accept(message: HamokMessage): void`: Accepts a message.

### Creating and Managing Maps

Hamok provides the `createMap` method to create and manage distributed maps.

```typescript
const mapConfig = {
  mapId: 'exampleMap',
};

const map = hamokInstance.createMap<string, number>(mapConfig);

// Adding an entry to the map
await map.set('key', 1);

// Retrieving an entry from the map
const value = map.get('key');
```

### Creating and Managing Records

Hamok provides the `createRecord` method to create and manage distributed records.

```typescript
const recordConfig = {
  recordId: 'exampleRecord',
};
type MyRecord = {
	field1: string,
	field2: number,
}

const myRecord = hamok.createRecord<MyRecord>(recordConfig);

// Setting a value in the record
await myRecord.set('field', 1);

// Getting a value from the record
const value = exampleRecord.get('field');
```

### Creating and Managing Queues

Hamok provides the `createQueue` method to create and manage distributed queues.

```typescript
const queueConfig = {
  queueId: 'exampleQueue',
  requestTimeoutInMs: 5000,
};

const queue = hamokInstance.createQueue(queueConfig);

// Adding an item to the queue
await queue.push('item');

// Removing an item from the queue
const item = queue.dequeue();
```

### Creating and Managing Emitters

Hamok provides the `createEmitter` method to create and manage distributed emitters.

```typescript
const emitterConfig = {
  emitterId: 'exampleEmitter',
  requestTimeoutInMs: 5000,
};

type EventMap = {
	'event': [data: string],
}

const emitter = hamok.createEmitter(emitterConfig);

await emitter.subscribe('event', () => {
	console.log('Event received');
});

// Emitting an event
emitter.emit('event');
```

## Snapshots

Hamok supports exporting and importing snapshots for persistence and recovery.


MORE DESCRIPTION ABOUT SNAPSHOTS


#### Exporting a Snapshot

```typescript
const snapshot = hamok.export();
```

#### Importing a Snapshot

```typescript
hamok.import(snapshot);
```

## Error Handling

Hamok emits an `error` event when an error occurs. Listen for this event to handle errors.

#### Example
```typescript
hamok.on('error', (error) => {
  console.error('An error occurred:', error);
});
```

## Examples


## Best Practices
- Ensure to handle the `error` event to catch and respond to any issues.
- Regularly export snapshots to persist the state of your Hamok instance.
- Properly configure timeouts and periods to match your application’s requirements.
- 

## Troubleshooting
If you encounter issues with Hamok, consider the following steps:
- Check the configuration for any incorrect settings.
- Ensure that network connectivity is stable if using remote peers.
- Review logs for any error messages or warnings.
- Consult the Hamok documentation and community forums for additional support.

## FAQ

### How do I start the Hamok instance?

Use the `start` method to start the instance:
```typescript
hamok.start();
```

### How do I stop the Hamok instance?

Use the `stop` method to stop the instance:
```typescript
hamok.stop();
```

### How do I add a remote peer?

Use the `addRemotePeerId` method to add a remote peer:
```typescript
hamok.addRemotePeerId('remotePeerId');
```

### How do I remove a remote peer?

Use the `removeRemotePeerId` method to remove a remote peer:
```typescript
hamok.removeRemotePeerId('remotePeerId');
```

### What is stored in Raft logs?

`HamokMessage`s. Every operation on a map, record, queue, or emitter is represented as a `HamokMessage` and 
every mutation request is stored in the Raft logs. The logs store the history of all operations, even the unsuccessful ones.
Every instance every map, record, queue, or emitter receives the messages and goes through exactly the same sequence of operations.

### What snapshots are good for?

See below.

### Can I overflow the memory with logs?

Yes you can. The logs are stored in memory and can grow indefinitely. To prevent memory overflow, 
either explicitly remove logs or set the expiration time for logs. Additionally you can use snapshots 
to store the state of the instance along with the commitIndex a snapshot represents. 
Therefore any new instance can start from the snapshot and apply only the logs after the snapshot.

### What is the difference between a map and a record?

A map is a key-value store, while a record is a single object with multiple fields.

### Is this an attempt to replace Redis?

No. Hamok is designed to be lightweight and its primary purpose is to manage 
a leader within a cluster and share data atomically. 
It is more suitable for configuration sharing, leader election, and other small but significant 
signals and data sharing, rather than acting as a full-fledged large and fast data sharing.
