## User Manual

- [Hamok](./index.md)
- [HamokEmitter](./emitter.md)
- [HamokMap](./map.md)
- [HamokQueue](./record.md)
- [HamokRecord](./remoteMap.md)
- HamokRemoteMap

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

`HamokRemoteMap` is a class that provides a distributed storage solution, enabling key-value pair manipulation across multiple instances with event-driven notifications. The primary distinction between `HamokMap` and `HamokRemoteMap` lies in the underlying storage mechanism. `HamokRemoteMap` leverages a `RemoteMap` as its base for storing key-value pairs, which can reside in a remote location (e.g., Redis, a database, etc.). Hamok is then used solely to ensure operational consistency across distributed instances.

This design is ideal for scenarios where a large number of key-value pairs need to be managed by multiple instances. Instead of introducing a distributed locking mechanism, `HamokRemoteMap` utilizes the RAFT consensus algorithm to guarantee consistent operation execution, ensuring consistency and fault tolerance in distributed systems.

## Configuration

```typescript
const config: HamokRemoteMapBuilderConfig<number, string> = {
  /**
   * The unique identifier for the map.
   */
  mapId: "remoteMapId",

  /**
   * Optional. The timeout duration in milliseconds for requests.
   */
  requestTimeoutInMs: 5000,

  /**
   * Optional. The maximum waiting time in milliseconds for a message to be sent.
   * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
   */
  maxMessageWaitingTimeInMs: 30000,

  /**
   * Optional. A codec for encoding and decoding keys in the map.
   *
   * DEFAULT: JSON codec
   */
  keyCodec: {
    encode: (key: number) => (new DataView(new ArrayBuffer(4))).setInt32(0, key)),
    decode: (data: Uint8Array) => (new DataView(data)).getInt32(0),
  },

  /**
   * Optional. A codec for encoding and decoding values in the map.
   *
   * DEFAULT: JSON Codec
   */
  valueCodec: valueCodec?: {
    encode: (value: V) => Buffer.from(JSON.stringify(value)),
    decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
  },

  /**
   * Optional. The maximum number of keys allowed in request or response messages.
   *
   * DEFAULT: 0 means Infinity
   */
  maxOutboundMessageKeys: 1000,

  /**
   * Optional. The maximum number of values allowed in request or response messages.
   *
   * DEFAULT: 0 means Infinity
   */
  maxOutboundMessageValues: 1000,

  /**
   * The remote map to be used to store the data.
   */
  remoteMap: createMyRemoteMap(),

  /**
   * Flag indicate if the events should be emitted by the event emitter or not.
   * It also reduces the communication overhead if not needed, as for emitting events
   * the leader should send a message to all followers to emit an event.
   * In such case when it's not necessary (like cache maintenance) it can be disabled.
   *
   * DEFAULT: false
   */
  noEvents: false,

  /**
   * Optional. A function to determine equality between two values.
   * Used for custom equality checking.
   */
  equalValues: (a: V, b: V) => a === b,
};

const remoteMap = hamok.createRemoteMap<number, string>(config);
```

## API Reference

### Properties

- **`id: string`**: Returns the unique identifier of the storage.
- **`closed: boolean`**: Indicates whether the storage is closed.

### Events

`HamokRemoteMap` extends `EventEmitter` and emits the following events:

- **`insert(key: K, value: V)`**: Emitted when a new entry is inserted.
- **`update(key: K, oldValue: V, newValue: V)`**: Emitted when an entry is updated.
- **`remove(key: K, value: V)`**: Emitted when an entry is removed.
- **`clear()`**: Emitted when the storage is cleared.
- **`close()`**: Emitted when the storage is closed.

### Event Handling

You can listen to these events using the standard `EventEmitter` API:

```typescript
remoteMap.on("insert", (key, value) => {
  console.log(`Inserted: ${key} = ${value}`);
});

remoteMap.on("update", (key, oldValue, newValue) => {
  console.log(`Updated: ${key} from ${oldValue} to ${newValue}`);
});

remoteMap.on("remove", (key, value) => {
  console.log(`Removed: ${key} = ${value}`);
});
```

### Methods

- **`close(): void`**  
  Closes the storage, disconnecting it from the network and releasing all resources.

- **`size(): Promise<number>`**  
  Returns the number of entries in the storage.

- **`isEmpty(): Promise<boolean>`**  
  Returns `true` if the storage is empty, `false` otherwise.

- **`keys(): AsyncIterableIterator<K>`**  
  Returns an iterator for the keys in the storage.

- **`clear(): Promise<void>`**  
  Clears all entries from the storage.

- **`get(key: K): Promise<V | undefined>`**  
  Retrieves the value associated with the specified key.

- **`getAll(keys: IterableIterator<K> | K[]): Promise<ReadonlyMap<K, V>>`**  
  Retrieves all values associated with the specified keys.

- **`set(key: K, value: V): Promise<V | undefined>`**  
  Sets a key-value pair in the storage. If the key already exists, the value is updated.

- **`setAll(entries: ReadonlyMap<K, V>): Promise<ReadonlyMap<K, V>>`**  
  Sets multiple key-value pairs in the storage.

- **`insert(key: K, value: V): Promise<V | undefined>`**  
  Inserts a key-value pair into the storage. If the key already exists, it will not be updated.

- **`insertAll(entries: ReadonlyMap<K, V> | [K, V][]): Promise<ReadonlyMap<K, V>>`**  
  Inserts multiple key-value pairs into the storage.

- **`delete(key: K): Promise<boolean>`**  
  Deletes a key-value pair from the storage by key.

- **`deleteAll(keys: ReadonlySet<K> | K[]): Promise<ReadonlySet<K>>`**  
  Deletes multiple key-value pairs from the storage by their keys.

- **`remove(key: K): Promise<boolean>`**  
  Removes a key-value pair from the storage by key.

- **`removeAll(keys: ReadonlySet<K> | K[]): Promise<ReadonlyMap<K, V>>`**  
  Removes multiple key-value pairs from the storage by their keys.

- **`updateIf(key: K, value: V, oldValue: V): Promise<boolean>`**  
  Updates a key-value pair in the storage if the current value matches the specified `oldValue`.

- **`iterator(): AsyncIterableIterator<[K, V]>`**  
  Returns an iterator for the key-value pairs in the storage.

## Examples

- [use redis](https://github.com/balazskreith/hamok-ts/blob/main/examples/src/redis-remote-map-example.ts)

### Add Redis as RemoteMap

```typescript
import { RemoteMap } from "hamok/lib/collections/RemoteMap";
import Redis from "ioredis";

const publisher = new Redis();
const subscriber = new Redis();

type CachedItem = {
  id: string;
  value: string;
};

function createRemoteMap(mapId: string): RemoteMap<string, CachedItem> {
  return {
    async set(key, value, callback) {
      const oldValue = await publisher.hget(mapId, key);
      await publisher.hset(mapId, key, JSON.stringify(value));
      callback?.(oldValue ? JSON.parse(oldValue) : undefined);
    },
    async setAll(entries, callback) {
      const inserted: [string, CachedItem][] = [];
      const updated: [string, CachedItem, CachedItem][] = [];

      for (const [key, value] of entries) {
        const oldValue = await publisher.hget(mapId, key);
        if (oldValue) {
          updated.push([key, JSON.parse(oldValue), value]);
        } else {
          inserted.push([key, value]);
        }
        await publisher.hset(mapId, key, JSON.stringify(value));
      }

      callback?.({ inserted, updated });
    },
    iterator() {
      async function* asyncIterator() {
        const keys = await publisher.hkeys(mapId);
        for (const key of keys) {
          const value = await publisher.hget(mapId, key);
          yield [key, value ? JSON.parse(value) : undefined] as [
            string,
            CachedItem
          ];
        }
      }

      return asyncIterator();
    },
    async get(key) {
      const value = await publisher.hget(mapId, key);
      return value ? JSON.parse(value) : undefined;
    },
    async keys() {
      return (await publisher.hkeys(mapId)).values();
    },
    async getAll(keys) {
      const iteratedKeys = [...keys];
      const values = await Promise.all(
        iteratedKeys.map((key) => publisher.hget(mapId, key))
      );
      const entries = iteratedKeys
        .map((key, index) => [
          key,
          values[index] ? JSON.parse(values[index]) : undefined,
        ])
        .filter(([, value]) => value !== undefined);

      return new Map(entries as [string, CachedItem][]);
    },
    async remove(key) {
      const value = await publisher.hget(mapId, key);
      await publisher.hdel(mapId, key);

      return value ? JSON.parse(value) : undefined;
    },
    async removeAll(keys) {
      const iteratedKeys = [...keys];
      const values = await Promise.all(
        iteratedKeys.map((key) => publisher.hget(mapId, key))
      );
      const entries = iteratedKeys
        .map((key, index) => [
          key,
          values[index] ? JSON.parse(values[index]) : undefined,
        ])
        .filter(([, value]) => value !== undefined);
      await publisher.hdel(mapId, ...iteratedKeys);

      return new Map(entries as [string, CachedItem][]);
    },
    async clear() {
      return publisher.del(mapId).then(() => void 0);
    },
    async size() {
      return publisher.hlen(mapId);
    },
  };
}
```

Note that the serialization and deserialization methods for keys and values differ between Hamok instances and between an instance and a `RemoteMap`. This is because Hamok requires binary serialization and deserialization for its messages, while the requirements for `RemoteMap` are unknown and left to the developer's discretion. In the example above, we used simple JSON serialization and deserialization for keys and values.

## FAQ

### **How does `HamokRemoteMap` ensure data consistency?**

`HamokRemoteMap` uses Hamok which uses the Raft consensus algorithm to manage and replicate logs across distributed nodes, ensuring that all nodes agree on the operation order of the key-value store has to execute.

### **Can I use custom functions to compare values in `HamokRemoteMap`?**

Yes, you can provide a custom equality function when initializing `HamokRemoteMap` to define how values should be compared.

### **What happens when the storage is closed?**

When `HamokRemoteMap` is closed, it disconnects from the network, releases resources, and stops accepting or processing any new operations. All listeners are removed, and the `close` event is emitted.
