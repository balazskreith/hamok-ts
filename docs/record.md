## User Manual
 [Hamok](./index.md) | [HamokEmitter](./emitter.md) | [HamokMap](./map.md) | [HamokQueue](./queue.md) | HamokRecord

### Table of Contents
* [Overview](#overview)
* [Constructor](#constructor)
* [Properties](#properties)
* [Methods](#methods)
* [Events](#events)
* [FAQ](#faq)

### Overview

The `HamokRecord` class is designed to manage replicated storage with event-driven notifications. It supports operations like insertion, updating, deletion, and clearing of records, while emitting corresponding events.

### Create a HamokEmitter instance

You need a `Hamok` to create a `HamokRecord` instance. Here is how you can create a `HamokRecord` instance:

```typescript
const queue = hamok.createRecord<{ foo: string, bar: number }>({
	recordId: 'exampleRecord',
});
```

### Properties

- **id**: `string` - The unique identifier for the `HamokRecord` instance.
- **closed**: `boolean` - Indicates whether the `HamokRecord` instance is closed.

### Methods

#### `close(): void`
Closes the `HamokRecord` instance and releases resources.

#### `clear(): Promise<void>`
Clears all fields in the record.

#### `get<K extends keyof T>(key: K): T[K] | undefined`
Retrieves the value associated with the given key.

#### `set<K extends keyof T>(key: K, value: T[K]): Promise<T[K] | undefined>`
Sets the value for the given key.

#### `insert<K extends keyof T>(key: K, value: T[K]): Promise<T[K] | undefined>`
Inserts the value for the given key.

#### `updateIf<K extends keyof T>(key: K, value: T[K], oldValue: T[K]): Promise<boolean>`
Updates the value for the given key if the current value matches the specified old value.

#### `delete<K extends keyof T>(key: K): Promise<boolean>`
Deletes the entry associated with the given key.

#### `export(): HamokRecordSnapshot`
Exports the storage data.

#### `import(data: HamokRecordSnapshot, eventing?: boolean): void`
Imports the storage data.

### Events

The `HamokRecord` class emits the following events:

- **insert**: Emitted when a new entry is inserted.
- **update**: Emitted when an entry is updated.
- **remove**: Emitted when an entry is removed.
- **clear**: Emitted when all entries are cleared.
- **close**: Emitted when the `HamokRecord` instance is closed.

#### Example

```typescript
const record = new HamokRecord<MyRecordType>(connection, {
    equalValues: (a, b) => a === b,
    payloadsCodec: new Map([
        ['key1', myCodec]
    ]),
    initalObject: { key1: 'value1' }
});

record.on('insert', (payload) => console.log('Inserted:', payload));
record.on('update', (payload) => console.log('Updated:', payload));
record.on('remove', (payload) => console.log('Removed:', payload));
record.on('clear', () => console.log('Cleared all entries'));
record.on('close', () => console.log('Record closed'));

await record.set('key2', 'value2');
await record.updateIf('key2', 'newValue2', 'value2');
await record.delete('key2');
await record.clear();
record.close();
```

### FAQ

#### What is the difference between the `insert` and `set` methods?

The `set` method updates the value for a given key, regardless of whether the key already exists. The `insert` method, however, only adds a new key-value pair if the key does not already exist.

```typescript
await record.set('key', 'value'); // Updates or inserts the key-value pair
await record.insert('key', 'value'); // Inserts only if the key does not exist
```

#### How does the `updateIf` method work?

The `updateIf` method updates the value for a given key only if the current value matches the specified old value. This is useful for ensuring atomic updates based on the current state of the record.

```typescript
const success = await record.updateIf('key', 'newValue', 'currentValue');
if (success) {
    console.log('Value updated successfully');
} else {
    console.log('Value update failed');
}
```

#### How can I check if the `HamokRecord` instance is closed?

You can check if the `HamokRecord` instance is closed by using the `closed` property.

```typescript
if (record.closed) {
    console.log('The record is closed');
}
```

#### What happens if I try to perform operations on a closed `HamokRecord`?

Performing operations on a closed `HamokRecord` will throw an error. Ensure that the record is not closed before performing any operations.

```typescript
if (!record.closed) {
    await record.set('key', 'value');
} else {
    console.log('Cannot perform operations on a closed record');
}
```

#### How can I listen for events on the `HamokRecord`?

You can listen for events on the `HamokRecord` by using the `on` method to register event listeners.

```typescript
record.on('insert', (payload) => console.log('Inserted:', payload));
record.on('update', (payload) => console.log('Updated:', payload));
record.on('remove', (payload) => console.log('Removed:', payload));
record.on('clear', () => console.log('Cleared all entries'));
record.on('close', () => console.log('Record closed'));
```

This documentation provides an overview of the `HamokRecord` class, its methods, properties, events, and common usage patterns. For more detailed examples and use cases, refer to the respective sections in the documentation.