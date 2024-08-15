## User Manual

[Hamok](./index.md) | [HamokEmitter](./emitter.md) | [HamokMap](./map.md) | HamokQueue | [HamokRecord](./record.md) | [HamokRemoteMap](./remoteMap.md)

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

The `HamokRecord` class is designed to manage replicated storage with event-driven notifications. It supports operations like insertion, updating, deletion, and clearing of records, while emitting corresponding events.

### Create a HamokEmitter instance

You need a `Hamok` to create a `HamokRecord` instance. Here is how you can create a `HamokRecord` instance:

```typescript
const queue = hamok.createRecord<{ foo: string; bar: number }>({
  recordId: "exampleRecord",
});
```

## Configuration

You can pass the following configuration options at the time of creating a `HamokRecord`:

```typescript
const record = hamok.createRecord<{ foo: string; bar: number }>({
  /**
   * The unique identifier for the record.
   */
  recordId: "record1",

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
   * Optional. A function to determine equality between two values.
   * Used for custom equality checking.
   */
  equalValues: (a: V, b: V) => a === b,

  /**
   * Optional. The codec for encoding and decoding payloads.
   */
  payloadsCodec: new Map([["foo", myCodec]]),

  /**
   * Optional. The initial object for the record.
   */
  initialObject: { foo: "value1", bar: 42 },
});
```

## API Reference

### `HamokRecord<T extends HamokRecordObject>` Class

A class for managing distributed records with event-driven capabilities.

#### Properties

- **`id`**: `string` - The unique identifier of the record.
- **`closed`**: `boolean` - Indicates whether the record is closed.
- **`connection`**: `HamokConnection<string, string>` - The connection used by the record.
- **`equalValues`**: `<K extends keyof T>(a: T[K], b: T[K]) => boolean` - A function to compare values for equality.

#### Methods

- **close**(): `void` - Closes the record and releases any held resources.
- **clear**(): `Promise<void>` - Clears the record.
- **get**<`K extends keyof T`>(`key: K`): `T[K] | undefined` - Retrieves the value associated with the given key.
- **set**<`K extends keyof T`>(`key: K`, `value: T[K]`): `Promise<T[K] | undefined>` - Sets the value for the given key.
- **insert**<`K extends keyof T`>(`key: K`, `value: T[K]`): `Promise<T[K] | undefined>` - Inserts a new value for the given key.
- **updateIf**<`K extends keyof T`>(`key: K`, `value: T[K]`, `oldValue: T[K]`): `Promise<boolean>` - Updates the value if the old value matches.
- **delete**<`K extends keyof T`>(`key: K`): `Promise<boolean>` - Deletes the value associated with the given key.
- **export**(): `HamokRecordSnapshot` - Exports the current state of the record.
- **import**(`data: HamokRecordSnapshot`, `eventing?: boolean`): `void` - Imports the state from a snapshot.

#### Events

- **`clear`**: Emitted when the record is cleared.
- **`remove`**: Emitted when an entry is removed.
- **`insert`**: Emitted when an entry is inserted.
- **`update`**: Emitted when an entry is updated.
- **`close`**: Emitted when the record is closed.

### Example Usage

```typescript
const record = new HamokRecord<MyRecordType>(connection, {
  equalValues: (a, b) => a === b,
  payloadsCodec: new Map([["key1", myCodec]]),
  initalObject: { key1: "value1" },
});

record.on("insert", (payload) => console.log("Inserted:", payload));
record.on("update", (payload) => console.log("Updated:", payload));
record.on("remove", (payload) => console.log("Removed:", payload));
record.on("clear", () => console.log("Cleared all entries"));
record.on("close", () => console.log("Record closed"));

await record.set("key2", "value2");
await record.updateIf("key2", "newValue2", "value2");
await record.delete("key2");
await record.clear();
record.close();
```

## Examples

- [use events](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/record-events-example.ts)
- [use insert and get](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/record-insert-get-example.ts)

## FAQ

### What is the difference between the `insert` and `set` methods?

The `set` method updates the value for a given key, regardless of whether the key already exists. The `insert` method, however, only adds a new key-value pair if the key does not already exist.

```typescript
await record.set("key", "value"); // Updates or inserts the key-value pair
await record.insert("key", "value"); // Inserts only if the key does not exist
```

### How does the `updateIf` method work?

The `updateIf` method updates the value for a given key only if the current value matches the specified old value. This is useful for ensuring atomic updates based on the current state of the record.

```typescript
const success = await record.updateIf("key", "newValue", "currentValue");
if (success) {
  console.log("Value updated successfully");
} else {
  console.log("Value update failed");
}
```

### How can I check if the `HamokRecord` instance is closed?

You can check if the `HamokRecord` instance is closed by using the `closed` property.

```typescript
if (record.closed) {
  console.log("The record is closed");
}
```

### What happens if I try to perform operations on a closed `HamokRecord`?

Performing operations on a closed `HamokRecord` will throw an error. Ensure that the record is not closed before performing any operations.

```typescript
if (!record.closed) {
  await record.set("key", "value");
} else {
  console.log("Cannot perform operations on a closed record");
}
```

### How can I listen for events on the `HamokRecord`?

You can listen for events on the `HamokRecord` by using the `on` method to register event listeners.

```typescript
record.on("insert", (payload) => console.log("Inserted:", payload));
record.on("update", (payload) => console.log("Updated:", payload));
record.on("remove", (payload) => console.log("Removed:", payload));
record.on("clear", () => console.log("Cleared all entries"));
record.on("close", () => console.log("Record closed"));
```

This documentation provides an overview of the `HamokRecord` class, its methods, properties, events, and common usage patterns. For more detailed examples and use cases, refer to the respective sections in the documentation.
