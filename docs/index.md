## User Manual

Hamok / [HamokEmitter](./emitter.md) / [HamokMap](./map.md) / [HamokQueue](./record.md) / [HamokRecord](./remoteMap.md) / [HamokRemoteMap](./remoteMap.md)

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

- `storages`: `Map<string, HamokRecord<any> | HamokMap<any, any> | HamokEmitter<any> | HamokRemoteMap<any, any> | HamokQueue<any>>`

  - A map of storages managed by Hamok.

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

- `ready`: `Promise<void>`

  - A promise that resolves when the Hamok instance is joined to the Raft cluster and reached the commit head.

### Events

Hamok emits various events that can be listened to for handling specific actions.

- `started`: Emitted when the Hamok instance starts.
- `stopped`: Emitted when the Hamok instance stops.
- `follower`: Emitted when the instance becomes a follower.
- `leader`: Emitted when the instance becomes the leader.
- `joined`: Emitted when the instance joins the Raft cluster.
- `rejoining`: Emitted when the instance rejoins the Raft cluster.
- `left`: Emitted when the instance leaves the Raft cluster.
- `message`: Emitted when a message is received.
- `remote-peer-joined`: Emitted when a remote peer joins.
- `remote-peer-left`: Emitted when a remote peer leaves.
- `leader-changed`: Emitted when the leader changes.
- `state-changed`: Emitted when the state changes.
- `commit`: Emitted when a commit occurs.
- `heartbeat`: Emitted during heartbeats.
- `error`: Emitted when an error occurs.
- `no-heartbeat-from`: Emitted when no heartbeat is received from a peer.
- `close`: Emitted when the Hamok instance is closed.

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

- **waitUntilCommitHead**(): `Promise<void>`

  - Waits until the commit head is reached.

- **waitUntilLeader**(): `Promise<void>`

  - Waits until a leader is elected in the Raft cluster.

- **createMap**<`K, V`>(`options: HamokMapBuilderConfig<K, V>`): `HamokMap<K, V>`

  - Creates a new map with the provided options.

- **createRecord**<`T extends HamokRecordObject`>(`options: HamokRecordBuilderConfig<T>`): `HamokRecord<T>`

  - Creates a new record with the provided options.

- **createQueue**<`T`>(`options: HamokQueueBuilderConfig<T>`): `HamokQueue<T>`

  - Creates a new queue with the provided options.

- **createEmitter**<`T extends HamokEmitterEventMap`>(`options: HamokEmitterBuilderConfig<T>`): `HamokEmitter<T>`

  - Creates a new emitter with the provided options.

- **getOrCreateMap**<`K, V`>(`options: HamokMapBuilderConfig<K, V>`, `callback?: (exists: boolean) => void`): `HamokMap<K, V>`

  - Gets an existing map or creates a new map with the provided options.

- **getOrCreateEmitter**<`T extends HamokEmitterEventMap`>(`options: HamokEmitterBuilderConfig<T>`, `callback?: (exists: boolean) => void`): `HamokEmitter<T>`

  - Gets an existing emitter or creates a new emitter with the provided options.

- **getOrCreateRemoteMap**<`K, V`>(`options: HamokRemoteMapBuilderConfig<K, V>`, `callback?: (exists: boolean) => void`): `HamokRemoteMap<K, V>`

  - Gets an existing remote map or creates a new remote map with the provided options.

- **getOrCreateQueue**<`T`>(`options: HamokQueueBuilderConfig<T>`, `callback?: (exists: boolean) => void`): `HamokQueue<T>`

  - Gets an existing queue or creates a new queue with the provided options.

- **getOrCreateRecord**<`T extends HamokRecordObject`>(`options: HamokRecordBuilderConfig<T>`, `callback?: (exists: boolean) => void`): `HamokRecord<T>`

  - Gets an existing record or creates a new record with the provided options.

- **submit**(`entry: HamokMessage`): `Promise<void>`

  - Submits a message to the Raft engine.

- **accept**(`message: HamokMessage`): `void`

  - Accepts a message and processes it according to its type and protocol.

- **fetchRemotePeers**(`timeout?: number, customRequest?: HamokHelloNotificationCustomRequestType`): `Promise<HamokFetchRemotePeersResponse>`

  - Fetches remote peers with optional custom requests and timeout.

- **join**(`params: HamokJoinProcessParams`): `Promise<void>`

  - Runs a join process with the provided parameters. See [here](#use-the-join-method) for more details.

- **leave**(): `Promise<void>`
  - Leaves the Raft cluster.

## Use cases

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
const item = await queue.pop();
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

Hamok uses snapshots to help distributed storages catch up with remote peers. For example, when a record is created on one peer, it sends a `StorageHello` notification to the remote peers. The remote peers then reply with a `StorageState` notification, which may contains a snapshot of the storage and the last applied commit index on the remote peer. The local peer can apply this snapshot to catch up with the remote peer, allowing it to process logs from the leader and stay in sync with the remote peers.

While you can manually export and import snapshots using the `export` and `import` methods, Hamok automatically handles this process when a storage connection is established.

## Error Handling

Hamok emits an `error` event when an error occurs. Listen for this event to handle errors.

```typescript
hamok.on("error", (error) => {
  console.error("An error occurred:", error);
});
```

## Examples

- [election and reelection](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/common-reelection-example.ts)
- [example to use join and leave methods](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/common-join-leave-rejoin-example.ts)

## Best Practices

- Ensure to handle the `error` event to catch and respond to any issues.
- Properly configure timeouts and periods to match your application’s requirements.
-

## Troubleshooting

If you encounter issues with Hamok, consider the following steps:

- Check the configuration for any incorrect settings.
- Ensure that network connectivity is stable if using remote peers.
- Review logs for any error messages or warnings.
- Consult the Hamok documentation and community forums for additional support.

## Major changes and compatibility notes

- **version `2.5.x`**
  - The `HamokMessage` schema was changed, `STORAGE_HELLO_NOTIFICATION` and `STORAGE_STATE_NOTIFICATION` message type were added, can cause compatibility issues with previous versions.
  - The `import` and `export` methodd was removed from `Hamok` in favor of the unified `join` method.
  - The `start` and `stop` methods were removed from `Hamok` in favor of the unified `join` / `leave` async methods.
  - No more error will be thrown if the log gap is too big between the connected peers, the follower will pick up whatever it can, with the storage responsible for providing up-to-date snapshots to a remote peer through `StorageState` notifications.
- **version `2.3.x`**
  - The `HamokMessage` schema was changed, `JOIN_NOTIFICATION` message type was added, can cause compatibility issues with previous versions.

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

### Can I overflow the memory with logs?

Yes you can. By default the logs are stored in memory and can grow indefinitely. To prevent memory overflow,
either explicitly remove logs or set the expiration time for logs.

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

### How can I check if a Map/Record/Emitter/Queue already exists?

`Hamok` exposes the created objects via the `storages`, property. You can check if an object already exists by using a command like `if (hamok.storages.has(mapId))`. Alternatively, you can use the `getOrCreate` method (`getOrCreateMap`, `getOrCreateEmitter`, `getOrCreateRecord`, `getOrCreateRemoteMap`, `getOrCreateQueue`) to either retrieve an existing object or create a new one if it doesn't already exist.

### Can I use `undefined` as a value for a key or value?

There are no type restrictions for the generic types you can use in a Map, Record, Queue, or Emitter. However,
it is strongly advised to use `null` if you want to indicate that something is uninitialized but still exists.

### Can I create different types of storages with the same identifier?

You should not. In a single Hamok instance, this is checked when you create any storage. If the given identifier is already in use for another type of storage, the system will prevent you from creating it. However, if you create an emitter in one Hamok instance and a map with the same identifier in another Hamok instance, they may attempt to communicate, but it will lead to crashes. So you can, but you shouldn't.
