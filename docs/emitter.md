## User Manual

[Hamok](./index.md) / HamokEmitter / [HamokMap](./map.md) / [HamokQueue](./queue.md) / [HamokRecord](./record.md) / [HamokRemoteMap](./remoteMap.md)

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [Properties](#properties)
  - [Events](#events)
  - [Methods](#methods)
  - [Subscriptions](#subscriptions)
- [Examples](#examples)
- [FAQ](#faq)

## Overview

`HamokEmitter` is a class that provides a mechanism for managing distributed event subscriptions and publishing events across multiple nodes in a distributed system. It integrates with `HamokConnection` for communication and uses `EventEmitter` for event handling.

### Create a HamokEmitter instance

To create a `HamokEmitter` instance, you need a `Hamok` instance. Here is how you can create a `HamokEmitter` instance:

```typescript
const emitter = hamok.createEmitter<MyEventMap>({
  emitterId: "exampleEmitter",
});
```

### Configuration

```typescript
type MyEventMap = {
  myEvent: [string, number];
};
const emitter = hamok.createEmitter<MyEventMap>({
  /**
   * The unique identifier for the emitter.
   */
  emitterId: "exampleEmitter",

  /**
   * Optional. The timeout duration in milliseconds for requests.
   *
   * DEFAULT: 5000
   */
  requestTimeoutInMs: 5000,

  /**
   * Optional. The maximum number of keys allowed in request or response messages.
   *
   * DEFAULT: 0 means infinity
   */
  maxOutboundMessageKeys: 1000,

  /**
   * Optional. The maximum number of values allowed in request or response messages.
   *
   * DEFAULT: 0 means infinity
   */
  maxOutboundMessageValues: 100,

  /**
   * Optional. A map of payload codecs for encoding and decoding event payloads.
   * The key is an event type, and the value is a codec for that event type.
   *
   * DEFAULT: JSON codec
   */
  payloadsCodec: Map<
    keyof MyEventMap,
    {
      encode: (...args: unknown[]) => string;
      decode: (data: string) => unknown[];
    }
  >,
});
```

## API Reference

### `HamokEmitter<T extends HamokEmitterEventMap>` Class

A class for managing events and subscriptions in a distributed system.

#### Properties

- `id`: `string` - The unique identifier of the emitter.
- `closed`: `boolean` - Indicates whether the emitter is closed.
- `connection`: `HamokConnection<string, string>` - The connection used by the emitter.
- `payloadsCodec`: `Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>` - Optional codec for encoding and decoding payloads.
- `ready: Promise<void>` - A promise that resolves when the emitter is initialized and ready to use.

#### Methods

- **close**(): `void` - Closes the emitter and releases any held resources.
- **subscribe**<K extends keyof T>(`event: K`, `listener: (...args: T[K]) => void`): `Promise<void>` - Subscribes a listener to an event.
- **unsubscribe**<K extends keyof T>(`event: K`, `listener: (...args: T[K]) => void`): `Promise<void>` - Unsubscribes a listener from an event.
- **clear**(): `void` - Clears all subscriptions and listeners.
- **publish**<K extends keyof T>(`event: K`, `...args: T[K]`): `Promise<string[]>` - Publishes an event to all subscribed listeners.
- **notify**<K extends keyof T>(`event: K`, `...args: T[K]`): `void` - Notifies all subscribed listeners of an event.
- **export**(): `HamokEmitterSnapshot` - Exports the current state of the emitter.
- **import**(`snapshot: HamokEmitterSnapshot`): `void` - Imports the state from a snapshot.

### Events

- `InsertEntriesRequest`: Manages subscription and adds the source endpoint to the list.
- `RemoveEntriesRequest`: Manages subscription and removes the source endpoint from the list.
- `UpdateEntriesRequest`: Emits events with decoded payloads.
- `UpdateEntriesNotification`: Emits events with decoded payloads.
- `ClearEntriesNotification`: Manages subscription and removes the source endpoint from the list.
- `remote-peer-removed`: Removes the remote peer from all subscriptions.
- `close`: Closes the emitter and removes all listeners.

### Example Usage

```typescript
const emitter = new HamokEmitter(connection, payloadsCodec);

emitter.subscribe("event", (data) => {
  console.log(`Received data: ${data}`);
});

emitter.publish("event", "sample data").then((peerIds) => {
  console.log(`Event published to peers: ${peerIds}`);
});

emitter.unsubscribe("event", (data) => {
  console.log(`Unsubscribed from event`);
});

emitter.close();
```

### Subscriptions

Peers subscribe to events using the `subscribe` method. When an event is published, all subscribed peers receive the event.
You can observe the subscriptions by accessing the `subscriptions` property of the emitter.

```typescript
// Handle a peer subscribing to an event
for (const [event, peers] of emitter.subscriptions.entries()) {
  console.log(`Event: ${event}`, [ ...peers.entries() ]);
}
```

Additionally you can listen to the `add-peer` and `remove-peer` events to observe the subscriptions.

```typescript
// Handle a peer subscribing to an event
emitter.subscriptions.on('add-peer', (event, peerId) => {
  console.log(`Peer ${peerId} subscribed to event ${event}.`);
});

// Handle a peer unsubscribing from an event
emitter.subscriptions.on('remove-peer', (event, peerId) => {
  console.log(`Peer ${peerId} unsubscribed from event ${event}.`);
});
```

#### Add Metadata to subscription

Peers can subscribe to an event with metadata.

```typescript
type SubscriptionMetaData = {
  userId: string;
  timestamp: Date;  // Time when the peer subscribed
}

// Create the emitter with metadata for subscriptions
const emitter = hamok.createEmitter<MyEventMap, SubscriptionMetaData>({
  emitterId: "exampleEmitter",
});

// Handle a peer subscribing to an event
emitter.subscriptions.on('add-peer', (event, peerId, metaData) => {
  console.log(`Peer ${peerId} subscribed to event ${event}.`);
  console.log(`User ID: ${metaData?.userId}`);
  console.log(`Subscription Timestamp: ${metaData.timestamp}`);
});

// Handle a peer unsubscribing from an event
emitter.subscriptions.on('remove-peer', (event, peerId, metaData) => {
  console.log(`Peer ${peerId} unsubscribed from event ${event}.`);
  console.log(`User ID: ${metaData?.userId}`);
  console.log(`Unsubscription Timestamp: ${new Date().toISOString()}`);
});

```

#### Update Metadata for subscription

Peers can update the metadata for an existing subscription.

```typescript
// Update the metadata for a subscription
emitter.subscriptions.updateSubscriptionMetaData('myEvent', 'peerId', {
  userId
}, prevMetaData);
```


## Examples

- [simple distributed emitter](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/emitter-example.ts)
- [emitter catchup](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/emitter-catchup-example.ts)

## FAQ

### How do I create a HamokEmitter instance?

To create a `HamokEmitter` instance, you need a `HamokConnection`. Here is an example:

```typescript
const connection = new HamokConnection("my-storage-id");
const emitter = new HamokEmitter<MyEventMap>(connection);
```

### What configuration options are available for HamokEmitter?

When creating a `HamokEmitter` instance, you can optionally pass a `payloadsCodec` for encoding and decoding event payloads. The `payloadsCodec` is a map where each event key maps to an object with `encode` and `decode` functions.

### What events does HamokEmitter emit?

`HamokEmitter` extends `EventEmitter` and emits events based on the event keys defined in the `HamokEmitterEventMap`. Each event will pass the arguments defined in the event map to its listeners.

### How can I listen to HamokEmitter events?

You can listen to `HamokEmitter` events using the `on` method. Here is an example:

```typescript
emitter.on("myEvent", (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

### What properties are available in HamokEmitter?

- **id**: `string` - The unique identifier for the `HamokEmitter` instance.
- **closed**: `boolean` - Indicates whether the emitter is closed.

### How do I close a HamokEmitter instance?

To close a `HamokEmitter` instance, use the `close` method:

```typescript
emitter.close();
```

### How do I clear all event subscriptions in a HamokEmitter?

To clear all event subscriptions in a `HamokEmitter`, use the `clear` method:

```typescript
emitter.clear();
```

### How do I subscribe to an event?

To subscribe to an event, use the `subscribe` method:

```typescript
await emitter.subscribe("myEvent", (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

### How do I unsubscribe from an event?

To unsubscribe from an event, use the `unsubscribe` method:

```typescript
await emitter.unsubscribe("myEvent", (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

### How do I publish an event?

To publish an event, use the `publish` method:

```typescript
emitter.publish("myEvent", "Hello, world!", 42);
```

### What is the difference between the `publish` and `notify` methods?

The `publish` method publishes an event to all subscribed listeners and waits for the event to be published on remote peers.
then return a promise that resolves when the event is published on all remote peers subscribed to this event.

The `notify` method notifies all subscribed listeners of an event without waiting for the event to be published on remote peers.

In short use notify for fire and forget messages, and use publish for messages that need to be checked if it is delivered to the target remote peers.

### How many subscribers can a HamokEmitter have for one event?

A `HamokEmitter` can have an unlimited number of subscribers for each event on any peer.
The underlying `EventEmitter` implementation used in `HamokEmitter` has no limit on the number of listeners for an event.
To distribute the event to the remote peers subscribed to the event, the `HamokEmitter` uses the Raft consensus algorithm
to ensure that the subscription is consistent across all peers.

### What is the payloadsCodec for?

The `payloadsCodec` is a map of payload codecs for encoding and decoding event payloads. The key is an event type, and the value is a codec for that event type. This is useful for customizing the encoding and decoding of event payloads, if you are for example unsatisfied with the default JSON encoding/decoding.
