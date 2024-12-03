## 2.0.0

A complete rewritten version of Hamok with a new API and a new architecture.
Also an accidental publishing of this version before it was ready due to a working github action.

## 2.1.0

Another accidental publishing of this version before it was ready due to a working github action.

## 2.2.0

A ready version to use (hopefully)

### 2.3.0

- Add `JOIN_NOTIFICATION` message type to the message protocol
- Introucing `join()` method

### 2.4.0

- skipped, indicating a significant change applied to the library in the coming version.

### 2.5.0

- Added `STORAGE_HELLO_NOTIFICATION` message type to the message protocol.
- Added `STORAGE_STATE_NOTIFICATION` message type to the message protocol.
- Removed `import` method from `Hamok` in favor of the unified `join` method.
- Removed `export` method from `Hamok` in favor of the unified `join` method.
- Removed `start` method from `Hamok` in favor of the unified `join` method.
- Removed `stop` method from `Hamok` in favor of the `leave` method.
- Added `close` method to `Hamok` to close all resources.
- Added an `ready` promise to all storage components, allowing for awaiting until the storage is ready and initialized.
- Updated `HamokConnection` to join before sending any message except `StorageHello` and `StorageState`.
- Removed the restriction of log gap errors between connected peers. The follower now picks up whatever it can, with the storage responsible for providing up-to-date snapshots to a remote peer through `StorageState` notifications.
- Fixed a bug where a follower would vote for a candidate even if it had a leader.
- Added auto-rejoin functionality for `Hamok` when the connection is lost, provided it was in the joined state.
- Fixed a bug where detached remote peers were not detected if the peer was a follower and lost all connections. (Added `_checkRemotePeers` method for this).
- Added `ready` promise to `Hamok` to await until the `Hamok` is ready and initialized.

### 2.5.1

- Fixed a bug where the leader would not send a `StorageState` notification to a follower when the follower was behind the leader.
- Fixed bug of remaining remote peer not part of the grid due to follower ENDPOINT_STATE_NOTIFICATION contained a wrong endpoint.
- Changing follower behavior when falling out of the grid. Instead of trying to collect endpoints, it periodically sends JOIN_NOTIFICATION until a leader is not elected for the endpoint

### 2.6.0

 - Update `HamokEmitter` to have metaData property bind to subscriber peers per events.
  * Add Subscriptions to `HamokEmitter` to track the subscribers of an event.
	* Add `HamokEmitterStats` to track the number of events emitted and received by the emitter.
 - Simplifying discovery and joining methods in `Hamok`.