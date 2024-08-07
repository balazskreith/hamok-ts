## User Manual
[Hamok](./index.md) | HamokEmitter | [HamokMap](./map.md) | [HamokQueue](./queue.md) | [HamokRecord](./record.md)

## Table of Contents
* [Overview](#overview)
* [API Reference](#api-reference)
	* [Create a HamokEmitter instance](#create-a-hamokemitter-instance)
	* [Configuration](#configuration)
	* [Events](#events)
	* [Properties](#properties)
	* [Methods](#methods)
* [Examples](#examples)
* [FAQ](#faq)

## Overview

`HamokEmitter` is a class that provides a mechanism for managing distributed event subscriptions and publishing events across multiple nodes in a distributed system. It integrates with `HamokConnection` for communication and uses `EventEmitter` for event handling.

## API Reference `HamokEmitter<T extends HamokEmitterEventMap>`

### Create a HamokEmitter instance

To create a `HamokEmitter` instance, you need a `Hamok` instance. Here is how you can create a `HamokEmitter` instance:

```typescript
type MyEventMap = {
	myEvent: [string, number];
};
const emitter = hamok.createEmitter<MyEventMap>({

	/**
	 * The unique identifier for the emitter.
	 */
	emitterId: 'exampleEmitter',

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
	 */
	maxOutboundMessageKeys: 1000,

	/**
	 * Optional. The maximum number of values allowed in request or response messages.
	 */
	maxOutboundMessageValues: 100,

	/**
	 * Optional. A map of payload codecs for encoding and decoding event payloads.
	 * The key is an event type, and the value is a codec for that event type.
	 */
	payloadsCodec?: Map<keyof T, { encode: (...args: unknown[]) => string, decode: (data: string) => unknown[] }>,
});
```

### Configuration

```typescript
const emitter = hamok.createEmitter<MyEventMap>({
	emitterId: 'exampleEmitter',
});
```

### Events

The `HamokEmitter` class emits event given the event keys defined in the `HamokEmitterEventMap`. Each event will pass the arguments defined in the event map to its listeners.

```typescript
await emitter.subscribe('myEvent', (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

### Properties

- **id**: `string` - The unique identifier for the `HamokEmitter` instance.
- **closed**: `boolean` - Indicates whether the emitter is closed.

### Methods

#### `close()`

Closes the `HamokEmitter` instance, stopping all event subscriptions and communication.

```typescript
emitter.close();
```

#### `subscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void): Promise<void>`

Subscribes a listener to an event.

```typescript
await emitter.subscribe('myEvent', (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

#### `unsubscribe<K extends keyof T>(event: K, listener: (...args: T[K]) => void): Promise<void>`

Unsubscribes a listener from an event.

```typescript
await emitter.unsubscribe('myEvent', (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

#### `clear()`

Clears all event subscriptions.

```typescript
emitter.clear();
```

#### `publish<K extends keyof T>(event: K, ...args: T[K]): void`

Publishes an event to all subscribed listeners. 
It returns a promise that resolves when the event is published on all remote peers subscribed to this event.

```typescript
await emitter.publish('myEvent', 'Hello, world!', 42);
```

#### `notify<K extends keyof T>(event: K, ...args: T[K]): void`

Notifies all subscribed listeners of an event without waiting for the event to be published on remote peers.

```typescript
emitter.notify('myEvent', 'Hello, world!', 42);
```


#### `export(): HamokEmitterSnapshot`

Exports the current state of the emitter, including all event subscriptions. (Used by the `Hamok` class to export the entire state of the Hamok instance.)

```typescript
const snapshot = emitter.export();
console.log(snapshot);
```

#### `import(snapshot: HamokEmitterSnapshot): void`

Imports a previously exported emitter state. (Used by the `Hamok` class to import the entire state of the Hamok instance.)

```typescript
emitter.import(snapshot);
```

## Examples

 - [simple distributed emitter](../examples/src/emitter-example.ts)

## FAQ

### How do I create a HamokEmitter instance?

To create a `HamokEmitter` instance, you need a `HamokConnection`. Here is an example:

```typescript
const connection = new HamokConnection('my-storage-id');
const emitter = new HamokEmitter<MyEventMap>(connection);
```

### What configuration options are available for HamokEmitter?

When creating a `HamokEmitter` instance, you can optionally pass a `payloadsCodec` for encoding and decoding event payloads. The `payloadsCodec` is a map where each event key maps to an object with `encode` and `decode` functions.

### What events does HamokEmitter emit?

`HamokEmitter` extends `EventEmitter` and emits events based on the event keys defined in the `HamokEmitterEventMap`. Each event will pass the arguments defined in the event map to its listeners.

### How can I listen to HamokEmitter events?

You can listen to `HamokEmitter` events using the `on` method. Here is an example:

```typescript
emitter.on('myEvent', (message, count) => {
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
await emitter.subscribe('myEvent', (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

### How do I unsubscribe from an event?

To unsubscribe from an event, use the `unsubscribe` method:

```typescript
await emitter.unsubscribe('myEvent', (message, count) => {
  console.log(`Received: ${message} - ${count}`);
});
```

### How do I publish an event?

To publish an event, use the `publish` method:

```typescript
emitter.publish('myEvent', 'Hello, world!', 42);
```
