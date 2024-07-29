export function unmodifiableMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
	return map;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const EMPTY_MAP = unmodifiableMap(new Map<any, any>());
export function emptyMap<K, V>(): Map<K, V> {
	return EMPTY_MAP as Map<K, V>;
}

export function equalMaps<K, V>(mapA: ReadonlyMap<K, V>, ...maps: ReadonlyMap<K, V>[]): boolean {
	if (maps.length < 1) return true;
	const mapB = maps[0];

	for (const [ key, valueA ] of mapA) {
		const valueB = mapB.get(key);

		if (valueB !== valueA) return false;
	}
	for (const [ key, valueB ] of mapB) {
		const valueA = mapA.get(key);

		if (valueB !== valueA) return false;
	}
	
	return equalMaps<K, V>(mapB, ...maps.slice(1));
}

export function mapOf<K, V>(...args: [K, V][]) {
	return new Map<K, V>([ ...args ]);
}

export function mapFrom<K, V>(...iterables: IterableIterator<[K, V]>[]): Map<K, V> {
	const result = new Map<K, V>();

	for (const iterable of iterables) {
		for (const item of iterable) {
			result.set(...item);
		}
	}
	
	return result;
}

export function concatMaps<K, V>(result: Map<K, V>, ...iterables: ReadonlyMap<K, V>[]): Map<K, V> {
	for (const iterable of iterables) {
		for (const item of iterable) {
			result.set(...item);
		}
	}
	
	return result;
}

export function reduceMaps<K, V>(result: Map<K, V>, duplicateListened: (key: K, value1: V, value2: V) => void, ...iterables: ReadonlyMap<K, V>[]): Map<K, V> {
	for (const iterable of iterables) {
		for (const item of iterable) {
			const [ key, value1 ] = item;
			const value2 = result.get(key);

			if (value2) {
				duplicateListened(key, value1, value2);
			}
			result.set(...item);
		}
	}
	
	return result;
}

export function splitMap<K, V>(source: ReadonlyMap<K, V>, size: number, defaultProvider?: () => ReadonlyMap<K, V>[]): ReadonlyMap<K, V>[] {
	if (size < 1) {
		if (!defaultProvider) {
			throw new Error('size to split source cannot be less than 1');
		}
		
		return defaultProvider();
	}
	const result: ReadonlyMap<K, V>[] = [];
	let chunk: Map<K, V> | undefined;

	for (const [ key, value ] of source) {
		if (!chunk) {
			chunk = new Map<K, V>();
		}
		chunk.set(key, value);
		if (chunk.size < size) {
			continue;
		}
		result.push(chunk);
		chunk = undefined;
	}
	if (chunk) {
		result.push(chunk);
	}
	
	return result;
}

export function unmodifiableSet<T>(set: Set<T>): ReadonlySet<T> {
	return set;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const EMPTY_SET = unmodifiableSet(new Set<any>());
export function setOf<T>(...args: T[]) {
	return new Set<T>([ ...args ]);
}

export function setFrom<T>(...iterables: IterableIterator<T>[]): Set<T> {
	const result = new Set<T>();

	for (const iterable of iterables) {
		for (const item of iterable) {
			result.add(item);
		}
	}
	
	return result;
}

export function emptySet<T>(): Set<T> {
	return EMPTY_SET as Set<T>;
}

export function equalSets<T>(setA: ReadonlySet<T>, ...sets: ReadonlySet<T>[]): boolean {
	if (sets.length < 1) return true;
	const setB = sets[0];

	for (const item of setA) {
		if (!setB.has(item)) return false;
	}
	for (const item of setB) {
		if (!setA.has(item)) return false;
	}
	
	return equalSets<T>(setB, ...sets.slice(1));
}

export function concatSet<K>(result: Set<K>, ...iterables: ReadonlySet<K>[]): Set<K> {
	for (const iterable of iterables) {
		for (const item of iterable) {
			result.add(item);
		}
	}
	
	return result;
}

export function reduceSet<K>(result: Set<K>, duplicateListened: (item: K) => void, ...iterables: ReadonlySet<K>[]): Set<K> {
	for (const iterable of iterables) {
		for (const item of iterable) {
			if (result.has(item)) {
				duplicateListened(item);
			}
			result.add(item);
		}
	}
	
	return result;
}

export function splitSet<T>(source: ReadonlySet<T>, size: number, defaultProvider?: () => ReadonlySet<T>[]): ReadonlySet<T>[] {
	if (size < 1) {
		if (!defaultProvider) {
			throw new Error('size to split source cannot be less than 1');
		}
		
		return defaultProvider();
	}
	const result: ReadonlySet<T>[] = [];
	let chunk: Set<T> | undefined;

	for (const item of source) {
		if (!chunk) {
			chunk = new Set<T>();
		}
		chunk.add(item);
		if (chunk.size < size) {
			continue;
		}
		result.push(chunk);
		chunk = undefined;
	}
	if (chunk) {
		result.push(chunk);
	}
	
	return result;
}

export function collectEntriesByKeys<K, V>(entries: ReadonlyMap<K, V>, keys: ReadonlySet<K>): Map<K, V> {
	const result = new Map<K, V>();

	for (const key of keys) {
		const value = entries.get(key);

		if (value) result.set(key, value);
	}
	
	return result;
}

export function collectEntriesByNotInKeys<K, V>(entries: ReadonlyMap<K, V>, keys: ReadonlySet<K>): Map<K, V> {
	const result = new Map<K, V>();

	for (const [ key, value ] of entries) {
		if (keys.has(key)) continue;
		result.set(key, value);
	}
	
	return result;
}

export function groupArrayBy<T, K extends(string | number)>(list: T[], getKey: (item: T) => K | undefined, filter?: (item: T) => boolean) {
	const result = new Map<K, T[]>();

	for (const item of list) {
		if (filter && !filter(item)) continue;

		const key = getKey(item);

		if (key === undefined) continue;

		result.get(key)?.push(item) ?? result.set(key, [ item ]);
	}

	return result;
}