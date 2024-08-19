## User Manual

[Hamok](./index.md) / [HamokEmitter](./emitter.md) / HamokMap / [HamokQueue](./record.md) / [HamokRecord](./remoteMap.md) / [HamokRemoteMap](./remoteMap.md)

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

`HamokMap` is a class that provides a replicated storage solution across instances, allowing for key-value pair manipulation with event-driven notifications.

### Create a HamokMap instance

You need a Hamok to create a Map. Here is how you can create a HamokMap instance:

```typescript
const map = hamok.createMap<string, number>({
  mapId: "exampleMap",
});
```

## Configuration

At the time of creation, you can pass the following configuration options:

```typescript
const map = hamok.createMap<string, number>({
	/**
	 * The unique identifier for the map.
	 */
	mapId: 'map1',

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
	 * Optional. A codec for encoding and decoding keys in the map.
	 *
	 * DEFAULT: JSON codec
	 */
	keyCodec: {
		encode: (key: K) => Buffer.from(JSON.stringify(key)),
		decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
	}

	/**
	 * Optional. A codec for encoding and decoding values in the map.
	 *
	 * DEFAULT: JSON codec
	 */
	valueCodec?: {
		encode: (value: V) => Buffer.from(JSON.stringify(value)),
		decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
	}

	/**
	 * Optional. A function to determine equality between two values.
	 * Used for custom equality checking.
	 */
	equalValues: (a: V, b: V) => a === b,
});
```

## API Reference `HamokMap<K, V>`

A class representing a distributed map with various methods for manipulating and accessing the stored entries.

### Properties

- `id`: `string` - The unique identifier of the map.
- `closed`: `boolean` - Indicates whether the map is closed.
- `size`: `number` - The number of entries in the map.
- `isEmpty`: `boolean` - Indicates whether the map is empty.
- `equalValues`: `(a: V, b: V) => boolean` - A function to compare values for equality.

### Events

The `HamokMap` class extends `EventEmitter` and emits the following events:

- `insert` - Emitted when a new entry is inserted.
- `update` - Emitted when an entry is updated.
- `remove` - Emitted when an entry is removed.
- `clear` - Emitted when all entries are cleared.
- `close` - Emitted when the map is closed.

### Methods

- **close**(): `void`

  - Closes the map and releases any held resources.

- **keys**(): `IterableIterator<K>`

  - Returns an iterator over the keys in the map.

- **clear**(): `Promise<void>`

  - Clears all entries in the map.

- **get**(`key: K`): `V | undefined`

  - Retrieves the value associated with the specified key.

- **getAll**(`keys: IterableIterator<K> | K[]`): `ReadonlyMap<K, V>`

  - Retrieves all values associated with the specified keys.

- **set**(`key: K`, `value: V`): `Promise<V | undefined>`

  - Sets the value for the specified key.

- **setAll**(`entries: ReadonlyMap<K, V>`): `Promise<ReadonlyMap<K, V>>`

  - Sets multiple entries in the map.

- **insert**(`key: K`, `value: V`): `Promise<V | undefined>`

  - Inserts the specified entry into the map.

- **insertAll**(`entries: ReadonlyMap<K, V> | [K, V][]`): `Promise<ReadonlyMap<K, V>>`

  - Inserts multiple entries into the map.

- **delete**(`key: K`): `Promise<boolean>`

  - Deletes the entry associated with the specified key.

- **deleteAll**(`keys: ReadonlySet<K> | K[]`): `Promise<ReadonlySet<K>>`

  - Deletes multiple entries from the map.

- **remove**(`key: K`): `Promise<boolean>`

  - Removes the entry associated with the specified key.

- **removeAll**(`keys: ReadonlySet<K> | K[]`): `Promise<ReadonlyMap<K, V>>`

  - Removes multiple entries from the map.

- **updateIf**(`key: K`, `value: V`, `oldValue: V`): `Promise<boolean>`

  - Updates the entry if the current value matches the specified old value.

- **export**(): `HamokMapSnapshot`

  - Exports the map data as a snapshot.

- **import**(`data: HamokMapSnapshot`, `eventing?: boolean`): `void`

  - Imports data from a snapshot.

- **[Symbol.iterator]**(): `IterableIterator<[K, V]>`
  - Returns an iterator over the entries in the map.

### Example Usage

```typescript
const map = new HamokMap(connection, baseMap);

map.set("key", "value").then((oldValue) => {
  console.log(`Old value: ${oldValue}`);
});

const value = map.get("key");
console.log(`Value: ${value}`);

for (const [key, value] of map) {
  console.log(`Key: ${key}, Value: ${value}`);
}

map.close();
```

## Examples

- [use insert](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/map-insert-get-example.ts)
- [use events](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/map-events-example.ts)
- [use updateIf](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/map-update-if-example.ts)

## FAQ

### How do I create a HamokMap instance?

To create a HamokMap instance, you need a Hamok instance. Here is an example:

```typescript
const map = hamok.createMap<string, number>({
  mapId: "exampleMap",
});
```

### How can I listen to HamokMap events?

You can listen to HamokMap events using the `on` method. Here is an example:

```typescript
map.on("insert", (key, value) => console.log(`Inserted: ${key} -> ${value}`));
map.on("update", (key, oldValue, newValue) =>
  console.log(`Updated: ${key} from ${oldValue} to ${newValue}`)
);
map.on("remove", (key, value) => console.log(`Removed: ${key} -> ${value}`));
map.on("clear", () => console.log("Map cleared"));
map.on("close", () => console.log("Map closed"));
```

### How do I close a HamokMap instance?

To close a HamokMap instance, use the `close` method:

```typescript
map.close();
```

#### And what does that do?

The `close` method closes the map and releases any held resources.
It deletes the map from the Hamok instance and stops all event emissions.
You cannot mutate the map after it is closed.

### How do I clear all entries in a HamokMap?

To clear all entries in a HamokMap, use the `clear` method:

```typescript
await map.clear();
```

### How do I retrieve a value for a given key?

To retrieve a value for a given key, use the `get` method:

```typescript
const value = map.get("key1");
console.log(value);
```

### How do I set a value for a given key?

To set a value for a given key, use the `set` method:

```typescript
const oldValue = await map.set("key1", "value1");
console.log(oldValue);
```

### How do I insert a value for a given key?

To insert a value for a given key, use the `insert` method:

```typescript
const existingValue = await map.insert("key1", "value1");
console.log(
  existingValue
    ? "Insert failed, because the map already has a value for the key: " +
        existingValue
    : "Insert successful"
);
```

### How do I delete an entry for a given key?

To delete an entry for a given key, use the `delete` method:

```typescript
const success = await map.delete("key1");
console.log("Deleted", success ? "successfully" : "failed");
```

### What is the difference between the `set` and `insert` methods?

The `set` method updates the value for a given key, regardless of whether the key already exists.
The `insert` method, however, only adds a new key-value pair if the key does not already exist.

```typescript
map.on("insert", (key, value) => console.log(`Inserted: ${key} -> ${value}`));
map.on("update", (key, oldValue, newValue) =>
  console.log(`Updated: ${key} from ${oldValue} to ${newValue}`)
);
await map.set("key", "value"); // Updates or inserts the key-value pair
await map.set("key", "new-value"); // Updates or inserts the key-value pair
```

### What is the difference between delete and remove methods?

The `delete` method deletes the entry associated with the specified keyand returns `true`, or `false` indicating it's success or failuire.
The `remove` method removes the entry associated with the specified key return the removed value.

### How many entries can be pushed as batch to `setAll`, `insertAll`, `deleteAll`, and `removeAll` methods?

As many as you wish, just take care of the memory usage.
If you go in this way of large maps and batches, you should configure the `maxOutboundMessageKeys` and `maxOutboundMessageValues` options.
In that way, you can control the maximum number of keys and values allowed in request or response messages
preventing the communication channel to be bloated.

### How do I retrieve multiple values for multiple keys?

To retrieve multiple values for multiple keys, use the `getAll` method:

```typescript
const keys = ["key1", "key2"];
const values = map.getAll(keys);

console.log(values);
```

### Should I export the map?

As you wish, but I designed the `export` and `import` methods to be used by `Hamok` to export and import the whole state of the map.

### Can I change the value of entries in the map when iterating or modify the baseMap?

You can, but you should not! THe whole purpose of the HamokMap is to give a wrapper
to mutate the baseMap in a safe way. If you use the method designed for mutating the baseMap and
keep entries consistent then you have a consistent map. If you change the baseMap directly,
you can break the consistency of the map. But noone stops you from doing that.
