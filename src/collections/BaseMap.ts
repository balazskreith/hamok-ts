import * as Collections from '../common/Collections';

export type BaseMapUpdateResult<K, V> = {
	inserted: [K, V][],
	updated: [K, oldvalue: V, newValue: V][],
}

export interface BaseMap<K, V> extends Map<K, V> {
	getAll(keys: IterableIterator<K>): ReadonlyMap<K, V>;
	set(key: K, value: V, callback?: (oldValue: V | undefined) => void): this;
	setAll(entries: ReadonlyMap<K, V>, callback?: (result: BaseMapUpdateResult<K, V>) => void): this;
	insert(key: K, value: V): V | undefined;
	insertAll(entries: ReadonlyMap<K, V>): ReadonlyMap<K, V>;
	deleteAll(keys: IterableIterator<K>): K[];
	remove(key: K): V | undefined;
	removeAll(keys: IterableIterator<K>): ReadonlyMap<K, V>;
}

export class MemoryBaseMap<K, V> extends Map<K, V> implements BaseMap<K, V> {

	public constructor(
		entries?: ReadonlyMap<K, V>,
	) {
		super(entries);
	}

	public getAll(keys: IterableIterator<K>): ReadonlyMap<K, V> {
		const result = new Map<K, V>();

		for (const key of keys) {
			const value = this.get(key);

			if (value) {
				result.set(key, value);
			}
		}
        
		return Collections.unmodifiableMap(result);
	}

	public set(key: K, value: V, callback?: (oldValue: V | undefined) => void): this {
		const oldValue = this.get(key);

		super.set(key, value);
		callback?.(oldValue);

		return this;
	}

	public setAll(entries: ReadonlyMap<K, V>, callback?: (result: BaseMapUpdateResult<K, V>) => void): this {
		const inserted: [K, V][] = [];
		const updated: [K, V, V][] = [];

		for (const [ key, value ] of entries) {
			this.set(
				key, 
				value, 
				(oldValue) => {
					if (oldValue !== undefined) updated.push([ key, oldValue, value ]);
					else inserted.push([ key, value ]);
				}
			);
		}

		callback?.({
			inserted,
			updated,
		});
		
		return this;
	}
    
	public insert(key: K, value: V): V | undefined {
		const existingValue = this.get(key);

		if (existingValue) {
			return existingValue;
		}
		super.set(key, value);
	}

	public insertAll(entries: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
		const result = new Map<K, V>();

		for (const [ key, value ] of entries) {
			const existingValue = this.get(key);

			if (existingValue) {
				result.set(key, existingValue);
				continue;
			}
			super.set(key, value);
		}
		
		return result;
	}

	public deleteAll(keys: IterableIterator<K>): K[] {
		const result: K[] = [];

		for (const key of keys) {
			if (!this.has(key)) continue;

			result.push(key);
			this.delete(key);
		}
		
		return result;
	}

	public remove(key: K): V | undefined {
		const value = this.get(key);

		if (!value) return;

		super.delete(key);

		return value;
	}

	public removeAll(keys: IterableIterator<K>): ReadonlyMap<K, V> {
		const result: [K, V][] = [];

		for (const key of keys) {
			const value = this.get(key);

			if (!value) continue;

			super.delete(key);
			result.push([ key, value ]);
		}

		return new Map(result);
	}
}