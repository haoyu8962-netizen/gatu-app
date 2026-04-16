export class LRU<K, V> {
	private map = new Map<K, V>();
	private capacity: number;

	constructor(capacity: number) {
		this.capacity = capacity;
	}

	get(key: K): V | undefined {
		const value = this.map.get(key);
		if (value === undefined) return undefined;
		this.map.delete(key);
		this.map.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		this.map.delete(key);
		this.map.set(key, value);
		if (this.map.size > this.capacity) {
			const oldest = this.map.keys().next().value as K;
			this.map.delete(oldest);
		}
	}

	has(key: K): boolean {
		return this.map.has(key);
	}

	get size(): number {
		return this.map.size;
	}

	keys(): IterableIterator<K> {
		return this.map.keys();
	}
}
