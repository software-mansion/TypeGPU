import { act, render, screen } from '@testing-library/react';
import React, { Suspense, useState } from 'react';
import type { TgpuRoot } from 'typegpu';
import { describe, expect, vi } from 'vitest';
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

describe('useRoot', () => {
  it('should return an existing root without ever suspending', async ({ root }) => {
    let seen: TgpuRoot | undefined;

    function Consumer() {
      seen = useRoot();
      return <div data-testid="ready">ready</div>;
    }

    render(
      <Root root={root}>
        <Boundary>
          <Consumer />
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
    let seen: TgpuRoot | undefined;

    function Consumer() {
      seen = useRoot();
      return <div data-testid="ready">ready</div>;
    }

    await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );

    expect(screen.getByTestId('fallback')).toBeDefined();
    expect(seen).toBeUndefined();

    await resume();
    await flush();

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready')).toBeDefined();
    expect(seen).toBeDefined();
  });

  it('should not suspend a component mounted after the root settled', async () => {
    const seen: TgpuRoot[] = [];

    function Consumer({ id }: { id: string }) {
      seen.push(useRoot());
      return <div data-testid={id}>ready</div>;
    }

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
    expect(screen.getByTestId('first')).toBeDefined();

    // Mounting a fresh consumer once the root is fulfilled should be synchronous
    act(() => {
      screen.getByTestId('mount').click();
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('second')).toBeDefined();
    expect(seen[0]).toBe(seen[1]);
  });

  it('should keep hook order stable across suspending and resuming', async ({
    stallDeviceRequest,
  }) => {
    const resume = stallDeviceRequest();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Consumer() {
      const root = useRoot();
      const [counter, setCounter] = useState(0);
      return (
        <button type="button" data-testid="ready" onClick={() => setCounter((c) => c + 1)}>
          {root.device ? 'ready' : 'no-device'}:{counter}
        </button>
      );
    }

    await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );

    await resume();
    await flush();

    // Re-rendering after unsuspending must not trip React's hook-order check
    act(() => {
      screen.getByTestId('ready').click();
    });

    expect(screen.getByTestId('ready').textContent).toBe('ready:1');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should not suspend when the root was initialized by another hook', async () => {
    let consumerRenders = 0;

    function Status() {
      const result = useRootWithStatus();
      return <div data-testid="status">{result.status}</div>;
    }

    function Consumer() {
      consumerRenders++;
      useRoot();
      return <div data-testid="ready">ready</div>;
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
              <Consumer />
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
    expect(screen.getByTestId('ready')).toBeDefined();
    // A single render, no suspend-and-replay round trip
    expect(consumerRenders).toBe(1);
  });

  it('should throw the initialization error', async ({ disableWebGPU }) => {
    disableWebGPU();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Consumer() {
      useRoot();
      return <div data-testid="ready">ready</div>;
    }

    await renderAsync(
      <Catcher>
        <Root>
          <Boundary>
            <Consumer />
          </Boundary>
        </Root>
      </Catcher>,
    );

    expect(screen.getByTestId('error')).toBeDefined();
    errorSpy.mockRestore();
  });
});

describe('useRootOrError', () => {
  it('should return an existing root without ever suspending', async ({ root }) => {
    let seen: unknown;

    function Consumer() {
      seen = useRootOrError();
      return <div data-testid="ready">ready</div>;
    }

    render(
      <Root root={root}>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready')).toBeDefined();
    expect(seen).toStrictEqual({ status: 'fulfilled', value: root });
  });

  it('should suspend until an owned root initializes, then return it', async ({
    stallDeviceRequest,
  }) => {
    const resume = stallDeviceRequest();
    let seen: ReturnType<typeof useRootOrError> | undefined;

    function Consumer() {
      seen = useRootOrError();
      return <div data-testid="ready">ready</div>;
    }

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

    expect(screen.getByTestId('ready')).toBeDefined();
    expect(seen?.status).toBe('fulfilled');
  });

  it('should not suspend a component mounted after the root settled', async () => {
    function Consumer({ id }: { id: string }) {
      const result = useRootOrError();
      return <div data-testid={id}>{result.status}</div>;
    }

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
    expect(screen.getByTestId('first').textContent).toBe('fulfilled');

    act(() => {
      screen.getByTestId('mount').click();
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('second').textContent).toBe('fulfilled');
  });

  it('should not suspend when the root was initialized by another hook', async () => {
    let consumerRenders = 0;

    function Status() {
      const result = useRootWithStatus();
      return <div data-testid="status">{result.status}</div>;
    }

    function Consumer() {
      consumerRenders++;
      const result = useRootOrError();
      return <div data-testid="ready">{result.status}</div>;
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
              <Consumer />
            </Boundary>
          ) : null}
        </Root>
      );
    }

    await renderAsync(<App />);
    expect(screen.getByTestId('status').textContent).toBe('fulfilled');

    act(() => {
      screen.getByTestId('mount').click();
    });

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('ready').textContent).toBe('fulfilled');
    expect(consumerRenders).toBe(1);
  });

  it('should report a rejection instead of throwing', async ({ disableWebGPU }) => {
    disableWebGPU();
    let seen: ReturnType<typeof useRootOrError> | undefined;

    function Consumer() {
      seen = useRootOrError();
      return <div data-testid="ready">{seen.status}</div>;
    }

    await renderAsync(
      <Root>
        <Boundary>
          <Consumer />
        </Boundary>
      </Root>,
    );

    expect(screen.getByTestId('ready').textContent).toBe('rejected');
    expect(seen?.status).toBe('rejected');
  });
});
