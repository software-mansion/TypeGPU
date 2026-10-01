import { act, render, screen } from '@testing-library/react';
import React, { Suspense, startTransition, use, useLayoutEffect, useMemo, useState } from 'react';
import type { TgpuRoot } from 'typegpu';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { Root, useRoot, useRootOrError, useRootWithStatus } from '@typegpu/react';
import { it } from './utils/extended-test.tsx';

/**
 * Mounts the tree inside `act`, so that React can flush the retries it schedules
 * whenever a promise passed to `use` settles.
 */
async function renderAsync(ui: React.ReactElement) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(ui);
  });
  return result as ReturnType<typeof render>;
}

/** Lets React flush any pending retry of a suspended boundary */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function Boundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div data-testid="fallback">loading</div>}>{children}</Suspense>;
}

class Catcher extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <div data-testid="error">
        {this.state.error instanceof Error ? this.state.error.message : 'Unknown error'}
      </div>
    ) : (
      this.props.children
    );
  }
}

type RootHook = 'useRoot' | 'useRootOrError';

/** Calls the given hook, and returns the status of the root it observed */
function readRootStatus(hook: RootHook): string {
  if (hook === 'useRoot') {
    useRoot();
    return 'fulfilled';
  }
  return useRootOrError().status;
}

/** Calls the given hook, and returns the root it observed (if any) */
function readRoot(hook: RootHook): TgpuRoot | undefined {
  if (hook === 'useRoot') {
    return useRoot();
  }
  const result = useRootOrError();
  return result.status === 'fulfilled' ? result.value : undefined;
}

type NavigatorMock = { gpu: { requestAdapter: (...args: never[]) => unknown } };

/** Makes the adapter request settle immediately, without any artificial delay */
function settleAdapterRequestImmediately(
  navigator: NavigatorMock,
  outcome: { adapter: unknown } | { reason: unknown },
) {
  vi.mocked(navigator.gpu.requestAdapter).mockImplementation(() =>
    'adapter' in outcome ? Promise.resolve(outcome.adapter) : Promise.reject(outcome.reason),
  );
}

/** Makes the adapter request hang until either `resolve` or `reject` is called */
function controlAdapterRequest(navigator: NavigatorMock, adapter: unknown) {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  vi.mocked(navigator.gpu.requestAdapter).mockImplementation(
    () =>
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );

  return {
    resolve: async () => {
      await act(async () => {
        resolve(adapter);
        await new Promise((r) => setTimeout(r, 0));
      });
    },
    reject: async (reason: unknown) => {
      await act(async () => {
        reject(reason);
        await new Promise((r) => setTimeout(r, 0));
      });
    },
  };
}

describe.each(['useRoot', 'useRootOrError'] as const)('%s', (hook) => {
  // Resolved once, and reused across renders so that `use` gets a stable promise
  const otherResource = Promise.resolve('other');

  /** Uses the root, followed by more hooks and another `use`, all of which must survive replays */
  function Consumer({ id = 'ready' }: { id?: string }) {
    const status = readRootStatus(hook);
    const [counter, setCounter] = useState(0);
    const memo = useMemo(() => 'memo', []);
    const other = use(otherResource);
    return (
      <button type="button" data-testid={id} onClick={() => setCounter((c) => c + 1)}>
        {`${status}:${counter}:${memo}:${other}`}
      </button>
    );
  }

  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** Asserts that React didn't complain about anything, like mismatched hooks */
  function expectNoReactErrors() {
    expect(errorSpy).not.toHaveBeenCalled();
  }

  /** The error rendered by `Catcher` must be the original one, not something from React */
  function expectRejection(message: string) {
    if (hook === 'useRootOrError') {
      expect(screen.getByTestId('ready').textContent).toBe('rejected:0:memo:other');
      expectNoReactErrors();
    } else {
      expect(screen.getByTestId('error').textContent).toBe(message);
    }
  }

  it('should return an existing root without ever suspending', ({ root }) => {
    let seen: TgpuRoot | undefined;

    function RootConsumer() {
      seen = readRoot(hook);
      return <div data-testid="ready">ready</div>;
    }

    render(
      <Root root={root}>
        <Boundary>
          <RootConsumer />
        </Boundary>
      </Root>,
    );

    // Committed on the very first (synchronous) pass, no fallback in sight
    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready')).toBeDefined();
    expect(seen).toBe(root);
  });

  it('should suspend until an owned root initializes, then return it', async ({
    stallDeviceRequest,
  }) => {
    const resume = stallDeviceRequest();

    await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );
    expect(screen.getByTestId('fallback')).toBeDefined();

    await resume();
    await flush();

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    expectNoReactErrors();
  });

  it('should not suspend a component mounted after the root settled', async () => {
    function App() {
      const [mountLate, setMountLate] = useState(false);
      return (
        <Root>
          <Boundary>
            <Consumer id="first" />
            <button type="button" data-testid="mount" onClick={() => setMountLate(true)}>
              mount
            </button>
          </Boundary>
          {mountLate ? (
            <Boundary>
              <Consumer id="second" />
            </Boundary>
          ) : null}
        </Root>
      );
    }

    await renderAsync(<App />);
    expect(screen.getByTestId('first').textContent).toBe('fulfilled:0:memo:other');

    // Mounting a fresh consumer once the root is fulfilled should be synchronous
    act(() => {
      screen.getByTestId('mount').click();
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('second').textContent).toBe('fulfilled:0:memo:other');
    expectNoReactErrors();
  });

  it('should not suspend when the root was initialized by another hook', async () => {
    let consumerRenders = 0;

    function Status() {
      const result = useRootWithStatus();
      return <div data-testid="status">{result.status}</div>;
    }

    // Not using `Consumer`, as its extra `use` call could suspend on its own
    function CountingConsumer() {
      consumerRenders++;
      return <div data-testid="ready">{readRootStatus(hook)}</div>;
    }

    function App() {
      const [mountLate, setMountLate] = useState(false);
      return (
        <Root>
          <Status />
          <button type="button" data-testid="mount" onClick={() => setMountLate(true)}>
            mount
          </button>
          {mountLate ? (
            <Boundary>
              <CountingConsumer />
            </Boundary>
          ) : null}
        </Root>
      );
    }

    await renderAsync(<App />);
    // The root got initialized without anyone ever suspending on its promise
    expect(screen.getByTestId('status').textContent).toBe('fulfilled');

    act(() => {
      screen.getByTestId('mount').click();
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled');
    // A single render, no suspend-and-replay round trip
    expect(consumerRenders).toBe(1);
    expectNoReactErrors();
  });

  it('should report a missing WebGPU implementation', async ({ disableWebGPU }) => {
    disableWebGPU();

    await renderAsync(
      <Catcher>
        <Root>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>
      </Catcher>,
    );

    expectRejection('WebGPU is not supported by this browser.');
  });

  it('should survive a replay after the root resolves during a transition', async ({
    navigator,
    adapter,
  }) => {
    settleAdapterRequestImmediately(navigator, { adapter });

    await act(async () => {
      startTransition(() => {
        render(
          <Root>
            <Boundary>
              <Consumer />
            </Boundary>
          </Root>,
        );
      });
    });
    await flush();

    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    act(() => {
      screen.getByTestId('ready').click();
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:1:memo:other');
    expectNoReactErrors();
  });

  it('should survive a replay after the root rejects during a transition', async ({
    navigator,
  }) => {
    settleAdapterRequestImmediately(navigator, { reason: new Error('No adapter') });

    await act(async () => {
      startTransition(() => {
        render(
          <Catcher>
            <Root>
              <Boundary>
                <Consumer />
              </Boundary>
            </Root>
          </Catcher>,
        );
      });
    });
    await flush();

    expectRejection('No adapter');
  });

  it('should survive the root resolving long after suspending', async ({ navigator, adapter }) => {
    const request = controlAdapterRequest(navigator, adapter);

    await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );
    expect(screen.getByTestId('fallback')).toBeDefined();

    await request.resolve();

    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    expectNoReactErrors();
  });

  it('should survive the root rejecting long after suspending', async ({ navigator, adapter }) => {
    const request = controlAdapterRequest(navigator, adapter);

    await renderAsync(
      <Catcher>
        <Root>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>
      </Catcher>,
    );
    expect(screen.getByTestId('fallback')).toBeDefined();

    await request.reject(new Error('No adapter'));

    expectRejection('No adapter');
  });

  it('should work in StrictMode', async ({ navigator, adapter }) => {
    const request = controlAdapterRequest(navigator, adapter);

    await act(async () => {
      render(
        <Root>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>,
        { reactStrictMode: true },
      );
    });
    expect(screen.getByTestId('fallback')).toBeDefined();

    await request.resolve();

    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    act(() => {
      screen.getByTestId('ready').click();
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:1:memo:other');
    expectNoReactErrors();
  });

  it('should support being called multiple times in one component', async ({
    navigator,
    adapter,
  }) => {
    settleAdapterRequestImmediately(navigator, { adapter });

    function DoubleConsumer() {
      const first = readRootStatus(hook);
      const [a] = useState('a');
      const second = readRootStatus(hook);
      const [b] = useState('b');
      return <div data-testid="ready">{`${first}:${a}:${second}:${b}`}</div>;
    }

    await act(async () => {
      startTransition(() => {
        render(
          <Root>
            <Boundary>
              <DoubleConsumer />
            </Boundary>
          </Root>,
        );
      });
    });
    await flush();

    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:a:fulfilled:b');
    expectNoReactErrors();
  });

  it('should not suspend when remounted after the root settled', async () => {
    let renders = 0;
    function CountingConsumer() {
      renders++;
      return <Consumer />;
    }

    function App() {
      const [key, setKey] = useState(0);
      return (
        <Root>
          <button type="button" data-testid="remount" onClick={() => setKey((k) => k + 1)}>
            remount
          </button>
          <Boundary>
            <CountingConsumer key={key} />
          </Boundary>
        </Root>
      );
    }

    await renderAsync(<App />);
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');

    renders = 0;
    act(() => {
      screen.getByTestId('remount').click();
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    expect(renders).toBe(1);
    expectNoReactErrors();
  });

  it('should pick up an existing root provided while still suspended', async ({
    root,
    stallDeviceRequest,
  }) => {
    stallDeviceRequest();

    const { rerender } = await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );
    expect(screen.getByTestId('fallback')).toBeDefined();

    await act(async () => {
      rerender(
        <Root root={root}>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>,
      );
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    expectNoReactErrors();
  });

  it('should keep state when an already mounted consumer suspends again', async ({
    root,
    stallDeviceRequest,
  }) => {
    const { rerender } = await renderAsync(
      <Root root={root}>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );
    act(() => {
      screen.getByTestId('ready').click();
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:1:memo:other');

    // Switching over to an owned root, which has yet to initialize
    const resume = stallDeviceRequest();
    await act(async () => {
      rerender(
        <Root>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>,
      );
    });
    expect(screen.getByTestId('fallback')).toBeDefined();

    await resume();
    await flush();

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:1:memo:other');
    act(() => {
      screen.getByTestId('ready').click();
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:2:memo:other');
    expectNoReactErrors();
  });

  it('should keep showing the previous UI while a transition suspends on the root', async ({
    root,
    stallDeviceRequest,
  }) => {
    const { rerender } = await renderAsync(
      <Root root={root}>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );

    const resume = stallDeviceRequest();
    await act(async () => {
      startTransition(() => {
        rerender(
          <Root>
            <Boundary>
              <Consumer />
            </Boundary>
          </Root>,
        );
      });
    });
    // The transition is suspended, so the previous UI stays on screen
    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');

    await resume();
    await flush();

    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');
    act(() => {
      screen.getByTestId('ready').click();
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:1:memo:other');
    expectNoReactErrors();
  });

  it('should not suspend after a transition that suspended on the root got abandoned', async ({
    root,
    stallDeviceRequest,
  }) => {
    // Counting commits rather than renders, since React also renders fallbacks it never shows
    let fallbackCommits = 0;
    function CountingFallback() {
      useLayoutEffect(() => {
        fallbackCommits++;
      }, []);
      return <div data-testid="fallback">loading</div>;
    }

    function App({ withRoot }: { withRoot: boolean }) {
      return (
        <Root root={withRoot ? root : undefined}>
          <Suspense fallback={<CountingFallback />}>
            <Consumer />
          </Suspense>
        </Root>
      );
    }

    const { rerender } = await renderAsync(<App withRoot />);

    stallDeviceRequest();
    await act(async () => {
      startTransition(() => {
        rerender(<App withRoot={false} />);
      });
    });

    // An urgent update going back to the existing root, superseding the suspended transition
    await act(async () => {
      rerender(<App withRoot />);
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:0:memo:other');

    // Re-rendering should not suspend either
    await act(async () => {
      screen.getByTestId('ready').click();
    });
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled:1:memo:other');

    // Not even for a single frame
    expect(fallbackCommits).toBe(0);
    expectNoReactErrors();
  });

  it('should report a rejection for an already mounted consumer that suspends again', async ({
    root,
    navigator,
    adapter,
  }) => {
    const { rerender } = await renderAsync(
      <Catcher>
        <Root root={root}>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>
      </Catcher>,
    );

    const request = controlAdapterRequest(navigator, adapter);
    await act(async () => {
      rerender(
        <Catcher>
          <Root>
            <Boundary>
              <Consumer />
            </Boundary>
          </Root>
        </Catcher>,
      );
    });
    expect(screen.getByTestId('fallback')).toBeDefined();

    await request.reject(new Error('No adapter'));

    expectRejection('No adapter');
  });

  it('should not complain when unmounted while suspended', async ({ stallDeviceRequest }) => {
    const resume = stallDeviceRequest();

    const { unmount } = await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );
    expect(screen.getByTestId('fallback')).toBeDefined();

    unmount();
    await resume();
    await flush();

    expectNoReactErrors();
  });
});
