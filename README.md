Hamok
---
Hamok is a library provides distributed object storages.
It is developed on top of [Raft](https://raft.github.io/) consensus algorithm.

## Quick Start

```javascript
import { Hamok } from 'hamok';

(async () => {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	server_1.addRemotePeerId(server_2.localPeerId);
	server_2.addRemotePeerId(server_1.localPeerId);
	
	server_1.start();
	server_2.start();
	
	await Promise.all([
		new Promise(resolve => server_1.once('leader-changed', resolve)),
		new Promise(resolve => server_2.once('leader-changed', resolve)),
	]);
	
	const storage_1 = server_1.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	const storage_2 = server_2.createMap<string, number>({
		mapId: 'my-replicated-storage',
	});
	
	console.log('Setting value in storage on server_1 for key-1 to 1');
	console.log('Setting value in storage on server_2 for key-2 to 2');

	await Promise.all([
		storage_1.set('key-1', 1),
		storage_2.set('key-2', 2),
	]);
	await Promise.all([
		server_1.waitUntilCommitHead(),
		server_2.waitUntilCommitHead(),
	])
	
	console.log('value for key-2 by server_1:', storage_1.get('key-2'));
	console.log('value for key-1 by server_2:', storage_1.get('key-1'));

	server_1.stop();
	server_2.stop();
})();
```

## Table of Contents
* [Concept](#concepts)
* [Storages and Collections](#storages)
* [Storage Grids](#storage-grids)
* 

## Concept

Hamok is a lightweight, distributed object storage library developed using [Raft](https://raft.github.io/) consensus 
algorithm. Hamok provides distributed map, queue, event emitters, and record object. 
It is designed to minimize setup effort and maximize flexibility, it offers the essential 
logic to embed its library and utilize shared storage, enabling efficient object sharing across service instances.

### Hamok on RAFT

[Raft](https://raft.github.io/) is a consensus algorithm designed to manage a replicated log across a distributed system. 
Its primary goal is to ensure that multiple servers agree on a sequence of state transitions, providing consistency 
and fault tolerance in distributed systems. RAFT breaks down the consensus problem into three subproblems:

 - **Leader Election**: Ensures that one server acts as the leader, which is responsible for managing the log replication. 

 - **Log Replication**: The leader receives log entries from clients and replicates them to follower servers. The leader waits for a majority of followers to acknowledge the entries before considering them committed.

 - **Safety**: RAFT guarantees that committed log entries are durable and will not be lost, even in the presence of server failures. It ensures that no two leaders can be elected for the same term and that logs are consistent across servers.

Overall, RAFT is designed to be understandable and easy to implement while providing strong consistency and reliability in distributed systems.

Hamok uses Raft to manage the shared storage accross multiple instances.

## HamokMap

HamokMap is a distributed map implementation that leverages the RAFT algorithm to ensure 
consistency and fault tolerance. It provides a key-value store that can be accessed and 
modified by multiple service instances, allowing for efficient data sharing and 
synchronization across the system.

## HamokQueue

HamokQueue is a distributed queue that allows for asynchronous FIFO type message passing between service instances. 
Using RAFT, it maintains the order and durability of messages, ensuring that all instances have a 
consistent view of the queue contents and can process messages reliably.

## HamokEmitter

HamokEmitter is an event emitter designed for distributed systems. It allows service instances to emit and listen to events, 
facilitating communication between instances.

## HamokRecord

HamokRecord is a feature that provides distributed storage for individual record objects. 
Each record can be accessed and updated by multiple service instances, 
with RAFT ensuring that all updates are consistently applied and persisted across the system.



