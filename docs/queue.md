# HamokQueue Documentation

## Overview

`HamokQueue` is a class that implements a replicated queue with event-driven notifications. 
It supports typical queue operations like push, pop, and peek.

## API Reference `HamokQueue<T>`

### Create a HamokQueue instance

You need a `HamokConnection` and a `BaseMap` to create a `HamokQueue` instance. Here is how you can create a `HamokQueue` instance:

```typescript
const queue = hamok.createQueue<string>({
	queueId: 'exampleQueue',
});
```

### Configuration

You can pass the following configuration options at the time of creating a `HamokQueue`:

```typescript
const queue = hamok.createQueue<string>({
	/**
	 * The unique identifier for the queue.
	 */
	queueId: 'queue1',

	/**
	 * Optional. A codec for encoding and decoding items in the queue.
	 *
	 * DEFAULT: JSON codec
	 */
	codec: {
		encode: (item: T) => Buffer.from(JSON.stringify(item)),
		decode: (data: Uint8Array) => JSON.parse(Buffer.from(data).toString()),
	},

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
	 * Optional. A base map to be used as the initial state of the queue.
	 */
	baseMap: new BaseMap<number, T>(),

	/**
	 * Optional. The length of byte array used for queue keys.
	 * This also affects the maximum number of items ever pushed into the queue.
	 * Can be 2, 4, or 8 bytes.
	 * 
	 * Default is 4, which allows for 4.3 billion items in the queue during it's lifetime.
	 */
	lengthOfBytesQueueKeys: 4,
});
```

### Events

The `HamokQueue` class extends `EventEmitter` and emits the following events:

- `empty`
- `not-empty`
- `close`
- `remove`
- `add`

```typescript
queue.on('empty', () => console.log('Queue is empty'));
queue.on('not-empty', () => console.log('Queue is not empty'));
queue.on('close', () => console.log('Queue is closed'));
queue.on('remove', (item) => console.log(`Removed: ${item}`));
```

### Properties

- **id**: `string` - The unique identifier for the HamokQueue instance.
- **empty**: `boolean` - Indicates whether the queue is empty.
- **size**: `number` - The number of entries in the queue.

### Methods

#### `push(...values: T[]): Promise<void>`

Adds one or more values to the end of the queue.

```typescript
await queue.push('item1', 'item2');
console.log('Items pushed to the queue');
```

#### `pop(): Promise<T | undefined>`

Removes and returns the value at the front of the queue.

```typescript
const item = await queue.pop();
console.log('Popped item:', item);
```

#### `peek(): T | undefined`

Returns the value at the front of the queue without removing it.

```typescript
const item = queue.peek();
console.log('Peeked item:', item);
```

#### `clear(): Promise<void>`

Clears all entries in the queue.

```typescript
await queue.clear();
console.log('Queue cleared');
```

#### `[Symbol.iterator](): IterableIterator<T>`

Returns an iterator for the queue.

```typescript
for (const item of queue) {
    console.log('Iterated item:', item);
}
```

#### `close()`

Closes the HamokQueue instance and releases resources.

```typescript
queue.close();
console.log('Queue closed');
```

#### `export(): HamokQueueSnapshot`

Exports the storage data. (Used by the `Hamok` class to export the entire state of the Hamok instance.)

```typescript
const snapshot = queue.export();
console.log('Queue snapshot:', snapshot);
```

#### `import(snapshot: HamokQueueSnapshot): void`

Imports storage data. (Used by the `Hamok` class to import the entire state of the Hamok instance.)

```typescript
queue.import(snapshot);
console.log('Queue data imported');
```

## Examples

 - [push() and pop()]()
 - [events from the queue]()
