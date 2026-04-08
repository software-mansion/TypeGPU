import {
  createContext,
  type ReactNode,
  use,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';

type RootContextResult =
  | { status: 'pending'; promise: Promise<TgpuRoot> }
  | { status: 'resolved'; value: TgpuRoot }
  | { status: 'rejected'; error: unknown };

interface RootContext {
  initOrGetRoot(): RootContextResult;
}

class OwnRootContext implements RootContext {
  #result: RootContextResult | undefined;

  initOrGetRoot(): RootContextResult {
    if (!this.#result) {
      this.#result = {
        status: 'pending',
        promise: tgpu.init().then(
          (root) => {
            this.#result = { status: 'resolved', value: root };
            return root;
          },
          (error) => {
            this.#result = { status: 'rejected', error };
            throw error;
          },
        ),
      };
    }

    return this.#result;
  }
}

class ExistingRootContext implements RootContext {
  result: { status: 'resolved'; value: TgpuRoot };

  constructor(root: TgpuRoot) {
    this.result = { status: 'resolved', value: root };
  }

  initOrGetRoot(): RootContextResult {
    return this.result;
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

export const Root = ({ children, root }: RootProps) => {
  const [ownCtx] = useState(() => new OwnRootContext());
  const existingRootCtx = useMemo(() => {
    if (root) {
      return new ExistingRootContext(root);
    }
    return undefined;
  }, [root]);

  return <rootContext.Provider value={existingRootCtx ?? ownCtx}>{children}</rootContext.Provider>;
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
  const context = useContext(rootContext) ?? globalRootContextValue;

  const result = context.initOrGetRoot();
  if (result.status === 'rejected') {
    throw result.error as Error;
  }
  return result.status === 'pending' ? use(result.promise) : result.value;
}

/**
 * Same as {@link useRoot}, but returns `null` if the root failed to initialize.
 */
export function useRootOrError():
  | { status: 'resolved'; value: TgpuRoot }
  | { status: 'rejected'; error: unknown } {
  const context = useContext(rootContext) ?? globalRootContextValue;

  const result = context.initOrGetRoot();

  if (result.status === 'rejected') {
    return { status: 'rejected', error: result.error };
  }

  return result.status === 'pending'
    ? use(
        result.promise
          .then((value) => ({ status: 'resolved' as const, value }))
          .catch((error) => ({ status: 'rejected' as const, error })),
      )
    : { status: 'resolved', value: result.value };
}

/**
 * Same as {@link useRoot}, but does not suspend or throw.
 */
export function useRootWithStatus(): RootContextResult {
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
