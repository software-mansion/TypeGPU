const _warned = new WeakMap<object, Set<string>>();

/** Emits a warning at most once per key and tag. */
export function warnOnce(key: object, tag: string, message: string): void {
  let tags = _warned.get(key);

  if (!tags) {
    tags = new Set();
    _warned.set(key, tags);
  }

  if (tags.has(tag)) {
    return;
  }
  tags.add(tag);

  console.warn(message);
}
