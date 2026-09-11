/** The exact prefix of a stable sort, using O(k) storage and O(n log k)
 * comparisons. Input position breaks ties just as Array.sort does. */
export function smallest<T>(values: readonly T[], count: number, compare: (a: T, b: T) => number): T[] {
  if (count <= 0) return [];
  if (count >= values.length) return [...values].sort(compare);
  type Entry = { value: T; index: number };
  const heap: Entry[] = [];
  const order = (a: Entry, b: Entry) => compare(a.value, b.value) || a.index - b.index;
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (heap.length < count) {
      heap.push({ value, index });
      let child = heap.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (order(heap[parent]!, heap[child]!) >= 0) break;
        [heap[parent], heap[child]] = [heap[child]!, heap[parent]!]; child = parent;
      }
    } else if ((compare(value, heap[0]!.value) || index - heap[0]!.index) < 0) {
      heap[0] = { value, index };
      let parent = 0;
      while (parent * 2 + 1 < heap.length) {
        let child = parent * 2 + 1;
        if (child + 1 < heap.length && order(heap[child + 1]!, heap[child]!) > 0) child++;
        if (order(heap[parent]!, heap[child]!) >= 0) break;
        [heap[parent], heap[child]] = [heap[child]!, heap[parent]!]; parent = child;
      }
    }
  }
  return heap.sort(order).map(row => row.value);
}
