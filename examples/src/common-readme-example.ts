import { Hamok } from 'hamok';

(async () => {
	const server_1 = new Hamok();
	const server_2 = new Hamok();
	
	server_1.on('message', server_2.accept.bind(server_2));
	server_2.on('message', server_1.accept.bind(server_1));
	
	await Promise.all([
		server_1.join(),
		server_2.join(),
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
