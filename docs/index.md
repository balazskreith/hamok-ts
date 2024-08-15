## User Manual

[Hamok](./index.md) | [HamokEmitter](./emitter.md) | [HamokMap](./map.md) | HamokQueue | [HamokRecord](./record.md) | [HamokRemoteMap](./remoteMap.md)

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [API Reference](#api-reference)
   - [Properties](#properties)
   - [Events](#events)
   - [Methods](#methods)
5. [Use Cases](#use-cases)
   - [Joining the Grid Using the `join()` Method](#joining-the-grid-using-the-join-method)
   - [Executing Tasks on the leader](#executing-tasks-on-the-leader)
   - [Creating and Managing Maps](#creating-and-managing-maps)
   - [Creating and Managing Records](#creating-and-managing-records)
   - [Creating and Managing Queues](#creating-and-managing-queues)
   - [Creating and Managing Emitters](#creating-and-managing-emitters)
6. [Snapshots](#snapshots)
7. [Error Handling](#error-handling)
8. [Examples](#examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)
11. [`HamokMessage` compatibility Table](#hamokmessage-compatibility-table)
12. [FAQ](#faq)

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
import { Hamok } from "hamok";

const hamok = new Hamok();
```

## Configuration

Hamok can be configured using the `HamokConstructorConfig` type. Here is an example configuration:

```typescript
import { Hamok } from "hamok";

const config = {
  /**
   * Optional. Indicate if the Hamok should stop automatically when there are no remote peers.
   *
   * DEFAULT: false
   */
  autoStopOnNoRemotePeers: false,

  /**
   * Optional. The unique identifier for the peer in the Raft cluster.
   *
   * DEFAULT: a generated UUID v4
   */
  peerId: "peer-1",

  /**
   * Optional. The timeout duration in milliseconds for elections.
   * If an election has not been completed within this duration, a  candidate change state to follower.
   *
   * DEFAULT: 3000
   */
  electionTimeoutInMs: 3000,

  /**
   * Optional. The maximum idle time in milliseconds for a follower.
   * If the follower is idle for longer than this duration, it considers the leader to be unavailable and starts an election.
   *
   * DEFAULT: 1000
   */
  followerMaxIdleInMs: 500,

  /**
   * Optional. The interval in milliseconds at which heartbeats are sent by the leader to maintain authority over followers,
   * and sending the logs.
   *
   * DEFAULT: 100
   */
  heartbeatInMs: 100,

  /**
   * If true, this peer will only be a follower and will never become a candidate or leader.
   *
   * DEFAULT: false
   */
  onlyFollower: false,

  /**
   * Optional. Indicate if the Hamok should stop automatically when there are no remote peers.
   *
   * DEFAULT: false
   */
  autoStopOnNoRemotePeers: false,

  /**
   * Specifies the expiration time for RAFT logs, after which they will be removed from the locally stored logs.
   * If this is set, a newly joined peer must sync up to the point where they can catch up with the logs that the leader provides,
   * possibly using snapshots. This option is only applicable if `raftLogs` is not provided as a configuration option;
   * in that case, the provided `raftLogs` implementation will be used, and this option will have no effect.
   *
   * DEFAULT: 0 (no expiration)
   */
  logEntriesExpirationTimeInMs: 5 * 60 * 1000, // 5 minutes

  /**
   * An implementation of the `RaftLogs` interface to store RAFT logs in this instance.
   *
   * DEFAULT: `MemoryStoredRaftLogs`
   */
  raftLogs: createMyCustomRaftLogsStorage(),

  /**
   * Optional. A custom appData object to be used by the application utilizes Hamok.
   *
   * DEFAULT: an empty record
   */
  appData: {
    foo: 1,
    bar: "str",
  },
};

const hamok = new Hamok(config);
```

## API Reference `Hamok`

### Properties

- `config`: `HamokConfig`

  - The configuration object for the Hamok instance.

- `raft`: `RaftEngine`

  - The Raft engine instance used by Hamok for distributed consensus.

- `records`: `Map<string, HamokRecord<any>>`

  - A map of records managed by Hamok.

- `maps`: `Map<string, HamokMap<any, any>>`

  - A map of maps managed by Hamok.

- `queues`: `Map<string, HamokQueue<any>>`

  - A map of queues managed by Hamok.

- `emitters`: `Map<string, HamokEmitter<any>>`

  - A map of emitters managed by Hamok.

- `grid`: `HamokGrid`

  - The grid instance used for message routing and handling within Hamok.

- `localPeerId`: `string`

  - The local peer ID of the Hamok instance.

- `remotePeerIds`: `ReadonlySet<string>`

  - A read-only set of remote peer IDs connected to the Hamok instance.

- `leader`: `boolean`

  - A boolean indicating if the current instance is the leader.

- `state`: `RaftStateName`

  - The current state of the Raft engine.

- `run`: `boolean`
  - A boolean indicating if the Raft timer is running.

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
- `no-heartbeat-from`: Emitted when no heartbeat is received from a peer.

### Methods

- **constructor**(`providedConfig?: Partial<HamokConstructorConfig>`):

  - Creates a new Hamok instance with the provided configuration.

- **start**(): `void`

  - Starts the Hamok instance and the Raft engine.

- **stop**(): `void`

  - Stops the Hamok instance and the Raft engine.

- **addRemotePeerId**(`remoteEndpointId: string`): `void`

  - Adds a remote peer ID to the Raft engine.

- **removeRemotePeerId**(`remoteEndpointId: string`): `void`

  - Removes a remote peer ID from the Raft engine.

- **export**(): `HamokSnapshot`

  - Exports the current state of Hamok as a snapshot.

- **import**(`snapshot: HamokSnapshot`): `void`

  - Imports a snapshot to restore the state of Hamok.

- **waitUntilCommitHead**(): `Promise<void>`

  - Waits until the commit head is reached.

- **createMap**<`K, V`>(`options: HamokMapBuilderConfig<K, V>`): `HamokMap<K, V>`

  - Creates a new map with the provided options.

- **createRecord**<`T extends HamokRecordObject`>(`options: HamokRecordBuilderConfig<T>`): `HamokRecord<T>`

  - Creates a new record with the provided options.

- **createQueue**<`T`>(`options: HamokQueueBuilderConfig<T>`): `HamokQueue<T>`

  - Creates a new queue with the provided options.

- **createEmitter**<`T extends HamokEmitterEventMap`>(`options: HamokEmitterBuilderConfig<T>`): `HamokEmitter<T>`

  - Creates a new emitter with the provided options.

- **submit**(`entry: HamokMessage`): `Promise<void>`

  - Submits a message to the Raft engine.

- **accept**(`message: HamokMessage`): `void`

  - Accepts a message and processes it according to its type and protocol.

- **fetchRemotePeers**(`timeout?: number, customRequest?: HamokHelloNotificationCustomRequestType`): `Promise<HamokFetchRemotePeersResponse>`

  - Fetches remote peers with optional custom requests and timeout.

- **join**(`params: HamokJoinProcessParams`): `Promise<void>`
  - Runs a join process with the provided parameters. See [here](#use-the-join-method) for more details.

## Use cases

Here is a revised version of your text with improvements for clarity, grammar, and consistency:

---

### Joining the Grid Using the `join()` Method

Hamok provides an automated process to join a network of instances by connecting to remote peers. This feature simplifies integrating a new Hamok instance into an existing network.

The automated join process consists of two phases:

1. **Discover Remote Endpoints**: Add these endpoints to the local Hamok instance's list of remote peers.
2. **Notify Remote Peers**: Inform them about the local peer so they can add it to their lists.

The first phase is executed by the `fetchRemotePeers` method, which is called by the `join` method. This method sends a `HelloNotification` message to remote peers. Each remote peer responds with an `EndpointStateNotification` message, which includes all the peers known to them. The local peer waits for these notifications within a specified timeout and then evaluates the responses. If no remote peers are received and the local instance does not have a remote peer, the process is either retried or an exception is raised. Additionally, the `HelloNotification` message can include a custom request, such as requesting a snapshot from the remote peers, which can be applied to the local instance if provided.

In the second phase, a `JoinNotification` message is sent to remote peers, instructing them to add the local peer to their remote peer lists.

Below is an example of using the `join` method:

```typescript
await hamok.join({
  /**
   * Timeout in milliseconds for fetching remote peers.
   *
   * DEFAULT: 5000
   */
  fetchRemotePeerTimeoutInMs: 3000,

  /**
   * The maximum number of retries for fetching remote peers.
   * -1 - means infinite retries
   * 0 - means no retries
   *
   * DEFAULT: 3
   */
  maxRetry: 3,

  /**
   * Indicates if remote peers should be automatically removed if no heartbeat is received.
   *
   * DEFAULT: true
   */
  removeRemotePeersOnNoHeartbeat: true,

  /**
   * Indicates if a snapshot should be requested from the remote peers.
   * If provided, the best possible snapshot is selected amongst the provided ones and
   * imported into the local peer before it joins to the grid.
   *
   * DEFAULT: true
   */
  requestSnapshot: true,

  /**
   * Indicates if the start() method should be called automatically after the join process is completed.
   *
   * if startAfterJoin is true the method promise is only resolved if a leader is elected or assigned.
   *
   * DEFAULT: true
   */
  startAfterJoin: true,
});
```

In the above example, the method attempts to fetch remote peers three times, each with a timeout of 3000 milliseconds. If remote peers are not fetched within the given timeout, the process is retried. If the maximum number of retries is reached and the remote peers are still not fetched, an error is raised, indicating that joining is not possible.

Once remote peers are fetched, the local peer selects the best snapshot from the remote peers (based on the highest raft terms and commit index) and applies it to the local instance.

After the snapshot is applied and the remote peers are added to the local instance, the local peer sends a `JoinNotification` message to remote peers to add the local peer to their remote peer lists.

If `startAfterJoin` is set to true, the `start` method is automatically called once the join process is completed.

### Executing Tasks on the leader

```typescript
hamok.on("heartbeat", () => {
  if (!hamok.leader) return;

  // Execute tasks only on the leader
});
```

### Creating and Managing Maps

Hamok provides the `createMap` method to create and manage distributed maps.

```typescript
const mapConfig = {
  mapId: "exampleMap",
};

const map = hamokInstance.createMap<string, number>(mapConfig);

// Adding an entry to the map
await map.set("key", 1);

// Retrieving an entry from the map
const value = map.get("key");
```

### Creating and Managing Records

Hamok provides the `createRecord` method to create and manage distributed records.

```typescript
const recordConfig = {
  recordId: "exampleRecord",
};
type MyRecord = {
  field1: string;
  field2: number;
};

const myRecord = hamok.createRecord<MyRecord>(recordConfig);

// Setting a value in the record
await myRecord.set("field", 1);

// Getting a value from the record
const value = exampleRecord.get("field");
```

### Creating and Managing Queues

Hamok provides the `createQueue` method to create and manage distributed queues.

```typescript
const queueConfig = {
  queueId: "exampleQueue",
  requestTimeoutInMs: 5000,
};

const queue = hamokInstance.createQueue(queueConfig);

// Adding an item to the queue
await queue.push("item");

// Removing an item from the queue
const item = queue.dequeue();
```

### Creating and Managing Emitters

Hamok provides the `createEmitter` method to create and manage distributed emitters.

```typescript
type EventMap = {
  event: [data: string];
};

const emitter = hamok.createEmitter({
  emitterId: "exampleEmitter",
});

await emitter.subscribe("event", () => {
  console.log("Event received");
});

// Emitting an event
emitter.emit("event");
```

## Snapshots

Hamok supports exporting and importing snapshots for persistence and recovery.
Snapshots are used to store the state of a Hamok instance, including the Raft logs and the commit index.
It is designed to trim the logs and store the state of the instance along with the commit index a snapshot represents.
When you use snapshots you can start a new instance from the snapshot and apply only the logs after the snapshot.

### Exporting a Snapshot

```typescript
const snapshot = hamok.export();
```

### Importing a Snapshot

```typescript
hamok.import(snapshot);
```

## Error Handling

Hamok emits an `error` event when an error occurs. Listen for this event to handle errors.

```typescript
hamok.on("error", (error) => {
  console.error("An error occurred:", error);
});
```

## Examples

- [election and reelection](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/common-reelection-example.ts)
- [Import and export snapshots](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/common-import-export-example.ts)
- [Waiting for at least peers](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/common-waiting-example.ts)
- [Use helper method to discover/add/remove remote peers](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/common-discovery-example.ts)

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

Here is the updated markdown compatibility table for the `HamokMessage` schema with version 2.0.0 removed:

## `HamokMessage` compatibility Table

| Version | 2.1.0 | 2.2.0 | 2.3.0 |
| ------- | ----- | ----- | ----- |
| 2.1.0   | ✔️    | ✔️    | ❌    |
| 2.2.0   | ✔️    | ✔️    | ❌    |
| 2.3.0   | ❌    | ❌    | ✔️    |

- ✔️ Compatible
- ❌ Not Compatible

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
hamok.addRemotePeerId("remotePeerId");
```

### How do I remove a remote peer?

Use the `removeRemotePeerId` method to remove a remote peer:

```typescript
hamok.removeRemotePeerId("remotePeerId");
```

### How can I subscribe to events from the Hamok instance?

```typescript
hamok.on("started", () => console.log("Hamok instance started"));
hamok.on("stopped", () => console.log("Hamok instance stopped"));
hamok.on("follower", () => console.log("Instance is now a follower"));
hamok.on("leader", () => console.log("Instance is now the leader"));
hamok.on("message", (message) => console.log("Message received:", message));
hamok.on("remote-peer-joined", (peerId) =>
  console.log("Remote peer joined:", peerId)
);
hamok.on("remote-peer-left", (peerId) =>
  console.log("Remote peer left:", peerId)
);
hamok.on("leader-changed", (leaderId) =>
  console.log("Leader changed:", leaderId)
);
hamok.on("state-changed", (state) => console.log("State changed:", state));
hamok.on("commit", (commitIndex) =>
  console.log("Commit occurred:", commitIndex)
);
hamok.on("heartbeat", () => console.log("Heartbeat received"));
hamok.on("error", (error) => console.error("An error occurred:", error));
hamok.on("hello-notification", (peerId) =>
  console.log("Hello notification received from:", peerId)
);
hamok.on("no-heartbeat-from", (peerId) =>
  console.log("No heartbeat received from:", peerId)
);
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

### If I export a snapshot do I have to delete the logs?

Yes, if you don't have an expiration time set for logs,
you should delete the logs after exporting a snapshot.

### What is the difference between a map and a record?

A map is a key-value store, while a record is a single object with multiple fields.

### Is this an attempt to replace Redis?

No. Hamok primary purpose is to give the RAFT consensus algorithm to your service cluster,
so you can manage a leader within a cluster and share data atomically.
It is more suitable for configuration sharing, leader election, and other small but significant
signals and data sharing, rather than acting as a full-fledged large and fast data storing and retrieving service.

In general, if you just want to share key-value map or queue between two instance and you need it fast use Redis.
If you need to apply distributed lock to access a key in redis, Hamok can come into the picture as RAFT gives you atomicity.
Hamok can also be used to elect a leader in the cluster giving some special management job to one instance amongst the replicated many.

### What if the import/export is too large?

Well, I have not designed my neat lightweight distributed object storage to store billions of entries, but in this case
contact me and we can discuss the possibility of adding a feature to export the snapshot in chunks.

### How can I access `appData` of Hamok?

```typescript
import { Hamok } from "hamok";

const hamok = new Hamok({
  appData: {
    foo: 1,
  },
});

console.log("foo is", hamok.appData.foo);
```
