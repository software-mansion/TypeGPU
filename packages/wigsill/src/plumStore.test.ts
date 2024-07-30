import { describe, expect, it, vi } from 'vitest';
import { PlumStore } from './plumStore';
import { type Getter, plum, plumFromEvent } from './wgslPlum';

function makeSubject<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => unknown>();

  return {
    listeners,
    set: (newValue: T) => {
      value = newValue;
      for (const listener of listeners) {
        listener();
      }
    },
    getLatest: () => {
      return value;
    },
    subscribe: vi.fn((listener: () => unknown) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    }),
  };
}

describe('PlumStore', () => {
  it('should return initial value of source plum', () => {
    const store = new PlumStore();
    const fooPlum = plum(123);

    expect(store.get(fooPlum)).toEqual(123);
  });

  it('should compute value of plum lazily', () => {
    const compute = vi.fn(() => 123);
    const fooPlum = plum(compute);

    expect(compute).not.toBeCalled();

    const store = new PlumStore();

    expect(store.get(fooPlum)).toEqual(123);
    expect(compute).toBeCalledTimes(1);
  });

  it('should memoize value of computed plum', () => {
    const compute = vi.fn(() => 123);
    const fooPlum = plum(compute);

    expect(compute).not.toBeCalled();

    const store = new PlumStore();

    expect(store.get(fooPlum)).toEqual(123);
    expect(compute).toBeCalledTimes(1);

    expect(store.get(fooPlum)).toEqual(123);
    expect(compute).toBeCalledTimes(1); // still only one
  });

  it('should compute value based on dependencies', () => {
    const basePlum = plum(8);
    const expPlum = plum(2);

    const compute = vi.fn((get: Getter) => get(basePlum) ** get(expPlum));
    const fooPlum = plum(compute);

    expect(compute).not.toBeCalled();

    const store = new PlumStore();

    expect(store.get(fooPlum)).toEqual(64);
    expect(compute).toBeCalledTimes(1);

    // Checking if memoized
    expect(store.get(fooPlum)).toEqual(64);
    expect(compute).toBeCalledTimes(1);
  });

  it('should update value after setting', () => {
    const store = new PlumStore();
    const fooPlum = plum(256);

    expect(store.get(fooPlum)).toEqual(256);
    store.set(fooPlum, 512);
    expect(store.get(fooPlum)).toEqual(512);
  });

  it('should recompute value if dependency changes', () => {
    const basePlum = plum<number>(8).$name('base');
    const expPlum = plum<number>(2).$name('exp');

    const compute = vi.fn((get: Getter) => get(basePlum) ** get(expPlum));
    const fooPlum = plum(compute);

    const store = new PlumStore();

    expect(store.get(fooPlum)).toEqual(64);
    expect(compute).toBeCalledTimes(1);

    store.set(basePlum, 10);

    expect(store.get(fooPlum)).toEqual(100);
    expect(compute).toBeCalledTimes(2);

    // Memoized
    expect(store.get(fooPlum)).toEqual(100);
    expect(compute).toBeCalledTimes(2);
  });

  it('should notify subscriber when source plum changes', () => {
    const store = new PlumStore();
    const fooPlum = plum<number>(10).$name('foo');

    const listener = vi.fn(() => {});
    const unsubscribe = store.subscribe(fooPlum, listener);

    expect(listener).not.toBeCalled();

    store.set(fooPlum, 20);

    expect(listener).toBeCalledTimes(1);

    expect(store.get(fooPlum)).toEqual(20);

    unsubscribe();
  });

  it('should notify subscriber when computed plum changes', () => {
    const store = new PlumStore();
    const fooPlum = plum<number>(10).$name('foo');
    const doubledPlum = plum((get) => get(fooPlum) * 2).$name('doubled');

    const listener = vi.fn(() => {});
    const unsubscribe = store.subscribe(doubledPlum, listener);

    expect(listener).not.toBeCalled();

    store.set(fooPlum, 20);

    expect(listener).toBeCalledTimes(1);
    expect(store.get(doubledPlum)).toEqual(40);

    store.set(fooPlum, 30);

    expect(listener).toBeCalledTimes(2);
    expect(store.get(doubledPlum)).toEqual(60);

    unsubscribe();
  });

  it('should read external plum', () => {
    const subject = makeSubject(123);
    const externalPlum = plumFromEvent(subject.subscribe, subject.getLatest);

    const store = new PlumStore();
    expect(store.get(externalPlum)).toEqual(123);

    subject.set(234);

    expect(store.get(externalPlum)).toEqual(234);
  });

  it('should notify subscriber when external plum changes', () => {
    const subject = makeSubject(123);

    const externalPlum = plumFromEvent(
      subject.subscribe,
      subject.getLatest,
    ).$name('external');

    const store = new PlumStore();

    const listener = vi.fn(() => {});
    const unsubscribe = store.subscribe(externalPlum, listener);

    expect(subject.subscribe).toBeCalledTimes(1);
    expect(listener).not.toBeCalled();
    expect(subject.listeners.size).toEqual(1);

    expect(store.get(externalPlum)).toEqual(123);

    subject.set(245);

    expect(listener).toBeCalledTimes(1);
    expect(store.get(externalPlum)).toEqual(245);

    subject.set(111);

    expect(listener).toBeCalledTimes(2);
    expect(store.get(externalPlum)).toEqual(111);

    unsubscribe();
  });
});
