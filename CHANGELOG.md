## 2.0.0

A complete rewritten version of Hamok with a new API and a new architecture.
Also an accidental publishing of this version before it was ready due to a working github action.

## 2.1.0

Another accidental publishing of this version before it was ready due to a working github action.

## 2.2.0

A ready version to use (hopefully)

### 2.3.0

Introucing `join()` method

### 2.5.0

- Added `STORAGE_HELLO_NOTIFICATION` message type to the message protocol.
- Added `STORAGE_STATE_NOTIFICATION` message type to the message protocol.
- Removed `import` method from `Hamok` in favor of the unified `join` method.
- Removed `export` method from `Hamok` in favor of the unified `join` method.
- Removed `start` method from `Hamok` in favor of the unified `join` method.
- Removed `stop` method from `Hamok` in favor of the `leave` method.
- Added `close` method to `Hamok` to close all resources.
- Added an `initializing` promise to all storage components, allowing for awaiting until the storage is ready and initialized.
- Updated `HamokConnection` to join before sending any message except `StorageHello` and `StorageState`.
- Removed the restriction of log gap errors between connected peers. The follower now picks up whatever it can, with the storage responsible for providing up-to-date snapshots to a remote peer through `StorageState` notifications.
- Fixed a bug where a follower would vote for a candidate even if it had a leader.
- Added auto-rejoin functionality for `Hamok` when the connection is lost, provided it was in the joined state.
- Fixed a bug where detached remote peers were not detected if the peer was a follower and lost all connections. (Added `_checkRemotePeers` method for this).
