## User Manual

[Hamok](./index.md) / [HamokEmitter](./emitter.md) / [HamokMap](./map.md) / HamokQueue / [HamokRecord](./record.md) / [HamokRemoteMap](./remoteMap.md)

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [Properties](#properties)
  - [Events](#events)
  - [Methods](#methods)
- [Examples](#examples)
- [FAQ](#faq)

## Overview

`HamokQueue` is a class that implements a replicated queue with event-driven notifications.
It supports typical queue operations like push, pop, and peek.

### Create a HamokQueue instance

You need a `Hamok` to create a `HamokQueue` instance. Here is how you can create a `HamokQueue` instance:

```typescript
const queue = hamok.createQueue<string>({
  queueId: "exampleQueue",
});
```

## Configuration

You can pass the following configuration options at the time of creating a `HamokQueue`:

```typescript
const queue = hamok.createQueue<string>({
  /**
   * The unique identifier for the queue.
   */
  queueId: "queue1",

  /**
   * Optional. The timeout duration in milliseconds for requests.
   *
   * DEFAULT: 5000
   */
  requestTimeoutInMs: 5000,

  /**
   * Optional. The maximum waiting time in milliseconds for a message to be sent.
   * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
   *
   * DEFAULT: 10x requestTimeoutInMs
   */
  maxMessageWaitingTimeInMs: 50000,

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
   * Optional. A base map to be used as the initial state of the map.
   *
   * DEFAULT: a new and empty BaseMap instance
   */
  baseMap: new BaseMap<K, V>(),

  /**
   * Optional. The length of byte array used for queue keys.
   * This also affects the maximum number of items ever pushed into the queue.
   * Can be 2, 4, or 8 bytes.
   *
   * Default is 4, which allows for 4.3 billion items in the queue during it's lifetime.
   */
  lengthOfBytesQueueKeys: 4,

  /**
   * Optional. A codec for encoding and decoding items in the queue.
   *
   * DEFAULT: JSON codec
   */
  codec: {
    encode: (item: T) => Buffer.from(JSON.stringify(item)),
    decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
  },
});
```

## API Reference

### `HamokQueue<T>` Class

A class for managing a distributed queue with event-driven capabilities.

#### Properties

- **`id`**: `string` - The unique identifier of the queue.
- **`empty`**: `boolean` - Indicates whether the queue is empty.
- **`size`**: `number` - Returns the number of elements in the queue.
- **`connection`**: `HamokConnection<number, T>` - The connection used by the queue.
- **`baseMap`**: `BaseMap<number, T>` - The base map used for storing the queue elements.

#### Methods

- **push**(`...values: T[]`): `Promise<void>` - Pushes values onto the queue.
- **pop**(): `Promise<T | undefined>` - Removes and returns the value at the front of the queue.
- **peek**(): `T | undefined` - Returns the value at the front of the queue without removing it.
- **clear**(): `Promise<void>` - Clears the queue.
- **close**(): `void` - Closes the queue and releases any held resources.
- **export**(): `HamokQueueSnapshot` - Exports the current state of the queue.
- **import**(`snapshot: HamokQueueSnapshot`): `void` - Imports the state from a snapshot.

#### Events

- **`empty`**: Emitted when the queue becomes empty.
- **`not-empty`**: Emitted when the queue transitions from empty to not empty.
- **`add`**: Emitted when an item is added to the queue.
- **`remove`**: Emitted when an item is removed from the queue.
- **`close`**: Emitted when the queue is closed.

### Example Usage

```typescript
const queue = new HamokQueue(connection, baseMap);

queue.on("add", (value) => {
  console.log(`Added value: ${value}`);
});

queue.on("remove", (value) => {
  console.log(`Removed value: ${value}`);
});

queue
  .push("item1", "item2")
  .then(() => {
    return queue.pop();
  })
  .then((value) => {
    console.log(`Popped value: ${value}`);
  });

queue.clear().then(() => {
  console.log("Queue cleared");
});

queue.close();
```

## Examples

- [push() and pop()](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/queue-push-pop-example.ts)
- [events from the queue](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/queue-events-example.ts)

## FAQ

### What is the difference between the `add` event and the `push` method?

The `push` method is used to add one or more items to the end of the queue programmatically. When items are added to the queue using the `push` method, the `add` event is emitted. The `add` event acts as a notification to let listeners know that an item has been added to the queue.

```typescript
// Listening to the add event means any instance anywhere added an item to the queue
queue.on("add", (item) => console.log(`Added to the queue: ${item}`));

// Using push method to add items to the queue
await queue.push("item1", "item2");
```

### What is the difference between the `remove` event and the `pop` method?

The `pop` method is used to remove and return the item at the front of the queue programmatically. When an item is removed from the queue using the `pop` method, the `remove` event is emitted. The `remove` event acts as a notification to let listeners know that an item has been removed from the queue.

```typescript
// Listening to the remove event so means that any instance anywhere removed an item from the queue
queue.on("remove", (item) => console.log(`Removed from the queue: ${item}`));

// Using pop method to remove an item from the queue
const item = await queue.pop();
console.log("Popped item:", item);
```

### Can I use HamokQueue for real-time messaging?

HamokQueue is designed for replicated storage and is suitable for tasks like configuration sharing, leader election, and other significant signals and data sharing within a cluster. While it can be used for real-time messaging, it might not be as optimized as dedicated messaging systems like Redis or Kafka for high-throughput real-time message passing. So the answer is yes and no. you can use it for real-time messaging, but it might not be the best choice for high-throughput messaging, not mentioned about memory optimization.

### How can I check if the queue is empty?

You can check if the queue is empty by using the `empty` property of the `HamokQueue` instance.

```typescript
if (queue.empty) {
  console.log("The queue is empty");
} else {
  console.log("The queue is not empty");
}
```

### Can I iterate over the items in the queue?

Yes, you can iterate over the items in the queue using the iterator provided by the `[Symbol.iterator]()` method.

```typescript
for (const item of queue) {
  console.log("Iterated item:", item);
}
```
