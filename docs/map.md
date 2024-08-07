## User Manual
 [Hamok](./index.md) | [HamokEmitter](./emitter.md) | HamokMap | [HamokQueue](./queue.md) | [HamokRecord](./record.md)

## Table of Contents
* [Overview](#overview)
* [API Reference](#api-reference)
	* [Create a HamokMap instance](#create-a-hamokmap-instance)
	* [Configuration](#configuration)
	* [Events](#events)
	* [Properties](#properties)
	* [Methods](#methods)
* [Examples](#examples)
* [FAQ](#faq)

## Overview

`HamokMap` is a class that provides a replicated storage solution across instances, allowing for key-value pair manipulation with event-driven notifications.

## API Reference `HamokMap<K, V>`

### Create a HamokMap instance

You need a Hamok to create a Map. Here is how you can create a HamokMap instance:

```typescript
const map = hamok.createMap<string, number>({
	mapId: 'exampleMap',
});

```

### Configuration

At the time of creation, you can pass the following configuration options:

```typescript
const map = hamok.createMap<string, number>({
	/**
	 * The unique identifier for the map.
	 */
	mapId: 'map1',

	/**
	 * Optional. The timeout duration in milliseconds for requests.
	 */
	requestTimeoutInMs: 5000,

	/**
	 * Optional. The maximum waiting time in milliseconds for a message to be sent.
	 * The storage holds back the message sending if Hamok is not connected to a grid or not part of a network.
	 */
	maxMessageWaitingTimeInMs: 50000,

	/**
	 * Optional. A codec for encoding and decoding keys in the map.
	 * The default is a JSON codec
	 */
	keyCodec: {
		encode: (key: K) => Buffer.from(JSON.stringify(key)),
		decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
	}

	/**
	 * Optional. A codec for encoding and decoding values in the map.
	 * The default is a JSON codec
	 */
	valueCodec?: {
		encode: (key: V) => Buffer.from(JSON.stringify(key)),
		decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
	}

	/**
	 * Optional. The maximum number of keys allowed in request or response messages.
	 */
	maxOutboundMessageKeys: 1000,

	/**
	 * Optional. The maximum number of values allowed in request or response messages.
	 */
	maxOutboundMessageValues: 100,

	/**
	 * Optional. A base map to be used as the initial state of the map.
	 */
	baseMap: new BaseMap<K, V>(),

	/**
	 * Optional. A function to determine equality between two values.
	 * Used for custom equality checking.
	 */
	equalValues: (a: V, b: V) => a === b,
});
```

### Events

The `HamokMap` class extends `EventEmitter` and emits the following events:

- `insert`
- `update`
- `remove`
- `clear`
- `close`

```typescript
map.on('insert', (key, value) => console.log(`Inserted: ${key} -> ${value}`));
map.on('update', (key, oldValue, newValue) => console.log(`Updated: ${key} from ${oldValue} to ${newValue}`));
map.on('remove', (key, value) => console.log(`Removed: ${key} -> ${value}`));
map.on('clear', () => console.log('Map cleared'));
map.on('close', () => console.log('Map closed'));
```

### Properties

- **id**: `string` - The unique identifier for the HamokMap instance.
- **closed**: `boolean` - Indicates whether the map is closed.
- **size**: `number` - The number of entries in the map.
- **isEmpty**: `boolean` - Indicates whether the map is empty.

### Methods

#### `close()`

Closes the HamokMap instance and releases resources.

```typescript
map.close();
```

#### `clear()`

Clears all entries in the map.

```typescript
await map.clear();
```

#### `get(key: K)`

Retrieves the value for a given key.

```typescript
const value = map.get('key1');
console.log(value);
```

#### `getAll(keys: IterableIterator<K> | K[])`

Retrieves values for multiple keys.

```typescript
const keys = ['key1', 'key2'];
const values = map.getAll(keys);
console.log(values);
```

#### `set(key: K, value: V)`

Sets a value for a given key.

```typescript
const oldValue = await map.set('key1', 'value1');
console.log(oldValue);
```

#### `setAll(entries: ReadonlyMap<K, V>)`

Sets multiple entries in the map.

```typescript
const entries = new Map([['key1', 'value1'], ['key2', 'value2']]);
const oldValues = await map.setAll(entries);
console.log(oldValues);
```

#### `insert(key: K, value: V)`

Inserts a value for a given key.

```typescript
const existingValue = await map.insert('key1', 'value1');
console.log(existingValue ? 'Insert failed, becasue the map already has a value for the key: ' + existingValue : 'Insert successful');
```

#### `insertAll(entries: ReadonlyMap<K, V> | [K, V][])`

Inserts multiple entries in the map.

```typescript
const entries = new Map([['key1', 'value1'], ['key2', 'value2']]);
const existingValues = await map.insertAll(entries);
const existingValue = existingValues.get('key1');

console.log(existingValue ? 'Insert failed for key1, becasue the map already has a value for the key: ' + existingValue : 'Insert successful for key1');
```

#### `delete(key: K)`

Deletes an entry for a given key.

```typescript
const success = await map.delete('key1');
console.log('Deleted', success ? 'successfully' : 'failed');
```

#### `deleteAll(keys: ReadonlySet<K> | K[])`

Deletes multiple entries in the map.

```typescript
const keys = new Set(['key1', 'key2']);
const deletedKeys = await map.deleteAll(keys);
console.log('Deleted the following keys', deletedKeys);
```

#### `remove(key: K)`

Removes an entry for a given key.

```typescript
const success = await map.remove('key1');
console.log(success);
```

#### `removeAll(keys: ReadonlySet<K> | K[])`

Removes multiple entries in the map.

```typescript
const keys = new Set(['key1', 'key2']);
const removedEntries = await map.removeAll(keys);
console.log(removedEntries);
```

#### `updateIf(key: K, value: V, oldValue: V)`

Updates an entry if the old value matches.

```typescript
const success = await map.updateIf('key1', 'newValue', 'oldValue');
console.log(success);
```

#### `export()`

Exports the storage data. (Used by Hamok to export the map data)

```typescript
const snapshot = map.export();
console.log(snapshot);
```

#### `import(data: HamokMapSnapshot, eventing?: boolean)`

Imports storage data. (Used by Hamok to import the map data)

```typescript
map.import(snapshot);
```

## Examples

 - [use insert](../examples/src/map-insert-get-example.ts)
 - [use events](../examples/src/map-events-example.ts)
 - [use updateIf](../examples/src/map-update-if-example.ts)

## FAQ

## FAQ

### How do I create a HamokMap instance?

To create a HamokMap instance, you need a Hamok instance. Here is an example:

```typescript
const map = hamok.createMap<string, number>({
	mapId: 'exampleMap',
});
```

### What configuration options are available for HamokMap?

When creating a HamokMap instance, you can configure various options, such as `mapId`, `requestTimeoutInMs`, `maxMessageWaitingTimeInMs`, `keyCodec`, `valueCodec`, `maxOutboundMessageKeys`, `maxOutboundMessageValues`, `baseMap`, and `equalValues`.

### What events does HamokMap emit?

HamokMap extends `EventEmitter` and emits the following events:

- `insert`
- `update`
- `remove`
- `clear`
- `close`

### How can I listen to HamokMap events?

You can listen to HamokMap events using the `on` method. Here is an example:

```typescript
map.on('insert', (key, value) => console.log(`Inserted: ${key} -> ${value}`));
map.on('update', (key, oldValue, newValue) => console.log(`Updated: ${key} from ${oldValue} to ${newValue}`));
map.on('remove', (key, value) => console.log(`Removed: ${key} -> ${value}`));
map.on('clear', () => console.log('Map cleared'));
map.on('close', () => console.log('Map closed'));
```

### What properties are available in HamokMap?

- **id**: `string` - The unique identifier for the HamokMap instance.
- **closed**: `boolean` - Indicates whether the map is closed.
- **size**: `number` - The number of entries in the map.
- **isEmpty**: `boolean` - Indicates whether the map is empty.

### How do I close a HamokMap instance?

To close a HamokMap instance, use the `close` method:

```typescript
map.close();
```

### How do I clear all entries in a HamokMap?

To clear all entries in a HamokMap, use the `clear` method:

```typescript
await map.clear();
```

### How do I retrieve a value for a given key?

To retrieve a value for a given key, use the `get` method:

```typescript
const value = map.get('key1');
console.log(value);
```

### How do I set a value for a given key?

To set a value for a given key, use the `set` method:

```typescript
const oldValue = await map.set('key1', 'value1');
console.log(oldValue);
```

### How do I insert a value for a given key?

To insert a value for a given key, use the `insert` method:

```typescript
const existingValue = await map.insert('key1', 'value1');
console.log(existingValue ? 'Insert failed, because the map already has a value for the key: ' + existingValue : 'Insert successful');
```

### How do I delete an entry for a given key?

To delete an entry for a given key, use the `delete` method:

```typescript
const success = await map.delete('key1');
console.log('Deleted', success ? 'successfully' : 'failed');
```
