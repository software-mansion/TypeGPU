'use client'; // will cause the <Root /> component to be hydrated on the client
import React, {
  createContext,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { tgpu, type TgpuRoot } from 'typegpu';
import { useDeferredCleanup } from './helper-hooks.ts';
import { useBailOnServer } from './use-bail-on-server.ts';

function attachPromiseStatus<T>(
  promise: PromiseLike<T> & {
    status?: 'pending' | 'fulfilled' | 'rejected';
    value?: T;
    reason?: unknown;
  },
) {
  if (!promise.status) {
    promise.status = 'pending';
    promise.then(
      (v) => {
        promise.status = 'fulfilled';
        promise.value = v;
      },
      (e) => {
        promise.status = 'rejected';
        promise.reason = e;
      },
    );
  }
}

const use =
  React.use ||
  // A shim for older React versions
  function <T>(
    promise: PromiseLike<T> & {
      status?: 'pending' | 'fulfilled' | 'rejected';
      value?: T;
      reason?: unknown;
    },
  ): T {
    if (promise.status === 'pending') {
      throw promise;
    } else if (promise.status === 'fulfilled') {
      return promise.value as T;
    } else if (promise.status === 'rejected') {
      throw promise.reason;
    } else {
      attachPromiseStatus(promise);
      throw promise;
    }
  };

type RootContextPendingResult = {
  status: 'pending';
  promise: Promise<TgpuRoot>;
  settledPromise: Promise<PromiseSettledResult<TgpuRoot>>;
};
type RootContextFulfilledResult = {
  status: 'fulfilled';
  promise?: Promise<TgpuRoot> | undefined;
  settledPromise?: Promise<PromiseSettledResult<TgpuRoot>> | undefined;
  value: TgpuRoot;
};
type RootContextRejectedResult = { status: 'rejected'; reason: unknown };

type RootContextResult =
  | RootContextPendingResult
  | RootContextFulfilledResult
  | RootContextRejectedResult;

interface RootContext {
  initOrGetRoot(): RootContextResult;
  unmount(): void;
}

class OwnRootContext implements RootContext {
  #result: RootContextResult | undefined;
  #destroyed: boolean = false;

  initOrGetRoot(): RootContextResult {
    if (this.#destroyed) {
      console.warn(`[@typegpu/react]: Tried to init an already destroyed root.`);
      return { status: 'rejected', reason: new Error('Already destroyed') };
    }

    if (!this.#result) {
      const promise = tgpu.init().then(
        (root) => {
          if (this.#destroyed) {
            root.destroy();
            this.#result = undefined;
          } else {
            this.#result = { status: 'fulfilled', promise, settledPromise, value: root };
          }

          return root;
        },
        (reason) => {
          this.#result = { status: 'rejected', reason };
          throw reason;
        },
      );

      const settledPromise = promise.then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason }),
      );

      this.#result = {
        status: 'pending',
        promise,
        settledPromise,
      };
    }

    return this.#result;
  }

  unmount(): void {
    this.#destroyed = true;

    if (this.#result?.status === 'fulfilled') {
      this.#result.value.destroy();
    }
    this.#result = undefined;
  }
}

class ExistingRootContext implements RootContext {
  result: { status: 'fulfilled'; value: TgpuRoot };

  constructor(root: TgpuRoot) {
    this.result = { status: 'fulfilled', value: root };
  }

  initOrGetRoot(): RootContextResult {
    return this.result;
  }

  unmount(): void {
    // Nothing to do on unmount
  }
}

/**
 * Used in case no provider is mounted
 */
const globalRootContextValue = new OwnRootContext();

const rootContext = createContext<RootContext | null>(null);

export interface RootProps {
  /**
   * An existing root to provide. If undefined (default), a new root will be initialized for
   * this provider's children.
   *
   * @default undefined
   */
  root?: TgpuRoot | undefined;
  children?: ReactNode | undefined;
}

function WarnSuspense() {
  const warnedRef = useRef(false);
  useEffect(() => {
    if (warnedRef.current) {
      return;
    }

    warnedRef.current = true;
    console.warn(
      `[@typegpu/react] There's no Suspense boundary between <Root /> and components using @typegpu/react hooks. Either move the <Root /> component above a boundary, or provide one below it to customize the loading fallback. Note that the <ClientOnly /> component also acts as a Suspense boundary.`,
    );
  }, []);

  return null;
}

export const Root = ({ children, root }: RootProps) => {
  const [ownCtx] = useState(() => new OwnRootContext());
  const existingRootCtx = useMemo(() => {
    if (root) {
      return new ExistingRootContext(root);
    }
    return undefined;
  }, [root]);

  useDeferredCleanup(() => {
    ownCtx.unmount();
  });

  return (
    <rootContext.Provider value={existingRootCtx ?? ownCtx}>
      <Suspense fallback={<WarnSuspense />}>{children}</Suspense>
    </rootContext.Provider>
  );
};

/**
 * Returns the TypeGPU root shared between all components
 * under the nearest <Root></Root> provider. (equivalent to calling `await tgpu.init()`)
 * It's not necessary to use a `<Root>` provider; if none is found, the global context is used.
 *
 * If the root hasn't been initialized yet, it will suspend the component until it is.
 * This hook will throw if there is an error initializing the root (like no WebGPU support).
 * If you'd like to handle these cases yourself, you can use {@link useRootOrError} or
 * {@link useRootWithStatus} instead.
 */
export function useRoot(): TgpuRoot {
  useBailOnServer();

  const context = useContext(rootContext) ?? globalRootContextValue;

  const result = context.initOrGetRoot();
  if (result.status === 'rejected') {
    throw result.reason as Error;
  }
  // Making sure to `use` the promise again after the component unsuspends and it's already
  // been fulfilled, and to return the value outright if there was no promise to suspend on
  // before. This allows React to verify that hooks have run in the same order across renders.
  return result.promise ? use(result.promise) : (result as RootContextFulfilledResult).value;
}

/**
 * Same as {@link useRoot}, but returns a PromiseSettledResult-style object instead of throwing.
 * If initialization is still in progress, this hook will suspend until it settles.
 */
export function useRootOrError():
  | { status: 'fulfilled'; value: TgpuRoot }
  | { status: 'rejected'; reason: unknown } {
  useBailOnServer();

  const context = useContext(rootContext) ?? globalRootContextValue;

  const result = context.initOrGetRoot();

  if (result.status === 'rejected') {
    return { status: 'rejected', reason: result.reason };
  }

  // Making sure to `use` the promise again after the component unsuspends and it's already
  // been fulfilled, and to return the value outright if there was no promise to suspend on
  // before. This allows React to verify that hooks have run in the same order across renders.
  return result.settledPromise
    ? use(result.settledPromise)
    : { status: 'fulfilled', value: (result as RootContextFulfilledResult).value };
}

/**
 * Same as {@link useRoot}, but does not suspend or throw.
 */
export function useRootWithStatus(): RootContextResult {
  useBailOnServer();

  const context = useContext(rootContext) ?? globalRootContextValue;
  const result = context.initOrGetRoot();

  // Used to trigger a re-render
  const [_, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (result.status === 'pending') {
      result.promise.then(
        () => {
          if (cancelled) return;
          // On the next re-render, `initOrGetRoot` should return a non-promise value
          setEpoch((e) => e + 1);
        },
        () => {
          if (cancelled) return;
          setEpoch((e) => e + 1);
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [result]);

  return result;
}
