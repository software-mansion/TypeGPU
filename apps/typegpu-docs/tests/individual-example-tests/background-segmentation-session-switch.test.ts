import { describe, expect, it, vi } from 'vitest';
import {
  disposeSessions,
  switchSession,
  type SessionState,
} from '../../src/examples/image-processing/background-segmentation/sessionSwitch.ts';

function fakeSession(name: string) {
  return { name, release: vi.fn() };
}

type FakeSession = ReturnType<typeof fakeSession>;

function createState(initial: FakeSession): SessionState<FakeSession> {
  return { session: initial, modelIndex: 0, isLoadingModel: false, disposed: false };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('background-segmentation session switching', () => {
  it('installs the prepared session and releases the previous one once', async () => {
    const initial = fakeSession('initial');
    const next = fakeSession('next');
    const state = createState(initial);

    await switchSession(state, 1, async () => next);

    expect(state.session).toBe(next);
    expect(state.modelIndex).toBe(1);
    expect(state.isLoadingModel).toBe(false);
    expect(initial.release).toHaveBeenCalledTimes(1);
    expect(next.release).not.toHaveBeenCalled();
  });

  it('installs the new session before the previous one is released', async () => {
    const initial = fakeSession('initial');
    const next = fakeSession('next');
    const state = createState(initial);
    const seenWhenReleased: { installed: string; modelIndex: number }[] = [];
    initial.release.mockImplementation(() => {
      seenWhenReleased.push({ installed: state.session.name, modelIndex: state.modelIndex });
    });

    await switchSession(state, 1, async () => next);

    expect(seenWhenReleased).toEqual([{ installed: 'next', modelIndex: 1 }]);
  });

  it('releases the installed session only once when disposed repeatedly', () => {
    const initial = fakeSession('initial');
    const state = createState(initial);

    disposeSessions(state);
    disposeSessions(state);

    expect(initial.release).toHaveBeenCalledTimes(1);
    expect(state.disposed).toBe(true);
  });

  it('does not release a session again when disposed after a switch', async () => {
    const initial = fakeSession('initial');
    const next = fakeSession('next');
    const state = createState(initial);

    await switchSession(state, 1, async () => next);
    disposeSessions(state);
    disposeSessions(state);

    expect(initial.release).toHaveBeenCalledTimes(1);
    expect(next.release).toHaveBeenCalledTimes(1);
  });

  it('ignores a switch to the current model', async () => {
    const prepare = vi.fn(async () => fakeSession('unused'));
    const state = createState(fakeSession('initial'));

    await switchSession(state, 0, prepare);

    expect(prepare).not.toHaveBeenCalled();
  });

  it('ignores an overlapping switch while a model is loading', async () => {
    const pending = deferred<FakeSession>();
    const prepare = vi.fn(() => pending.promise);
    const initial = fakeSession('initial');
    const next = fakeSession('next');
    const state = createState(initial);

    const first = switchSession(state, 1, prepare);
    expect(state.isLoadingModel).toBe(true);
    await switchSession(state, 2, prepare);
    expect(prepare).toHaveBeenCalledTimes(1);

    pending.resolve(next);
    await first;

    expect(state.session).toBe(next);
    expect(state.modelIndex).toBe(1);
    expect(initial.release).toHaveBeenCalledTimes(1);
  });

  it('releases the prepared session instead of installing it when cleanup happened while loading', async () => {
    const pending = deferred<FakeSession>();
    const initial = fakeSession('initial');
    const prepared = fakeSession('prepared');
    const state = createState(initial);

    const switching = switchSession(state, 1, () => pending.promise);
    disposeSessions(state);
    pending.resolve(prepared);
    await switching;

    // the installed session was released by the cleanup, the prepared one by the switch
    expect(initial.release).toHaveBeenCalledTimes(1);
    expect(prepared.release).toHaveBeenCalledTimes(1);
    expect(state.session).toBe(initial);
    expect(state.modelIndex).toBe(0);
    expect(state.isLoadingModel).toBe(false);
  });

  it('does not start a switch after cleanup', async () => {
    const prepare = vi.fn(async () => fakeSession('unused'));
    const state = createState(fakeSession('initial'));

    disposeSessions(state);
    await switchSession(state, 1, prepare);

    expect(prepare).not.toHaveBeenCalled();
  });

  it('keeps the current session and rethrows when preparing fails', async () => {
    const initial = fakeSession('initial');
    const state = createState(initial);

    await expect(
      switchSession(state, 1, async () => {
        throw new Error('model failed to load');
      }),
    ).rejects.toThrow('model failed to load');

    expect(state.session).toBe(initial);
    expect(state.modelIndex).toBe(0);
    expect(state.isLoadingModel).toBe(false);
    expect(initial.release).not.toHaveBeenCalled();
  });

  it('can switch again after a failed switch', async () => {
    const state = createState(fakeSession('initial'));
    const next = fakeSession('next');

    await expect(
      switchSession(state, 1, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await switchSession(state, 1, async () => next);

    expect(state.session).toBe(next);
  });

  it('does not report a preparation failure that happens after cleanup', async () => {
    const pending = deferred<FakeSession>();
    const initial = fakeSession('initial');
    const state = createState(initial);

    const switching = switchSession(state, 1, () => pending.promise);
    disposeSessions(state);
    pending.reject(new Error('device destroyed'));

    await expect(switching).resolves.toBeUndefined();
    expect(initial.release).toHaveBeenCalledTimes(1);
    expect(state.isLoadingModel).toBe(false);
  });
});
