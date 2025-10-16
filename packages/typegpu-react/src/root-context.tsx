import {
  createContext,
  type ReactNode,
  use,
  useContext,
  useState,
} from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';

class RootContext {
  #root: TgpuRoot | undefined;
  #rootPromise: Promise<TgpuRoot> | undefined;

  initOrGetRoot(): Promise<TgpuRoot> | TgpuRoot {
    if (this.#root) {
      return this.#root;
    }

    if (!this.#rootPromise) {
      this.#rootPromise = tgpu.init().then((root) => {
        this.#root = root;
        return root;
      });
    }

    return this.#rootPromise;
  }
}

/**
 * Used in case no provider is mounted
 */
const globalRootContextValue = new RootContext();

const rootContext = createContext<RootContext | null>(null);

export interface RootProps {
  children?: ReactNode | undefined;
}

export const Root = ({ children }: RootProps) => {
  const [ctx] = useState(() => new RootContext());

  return (
    <rootContext.Provider value={ctx}>
      {children}
    </rootContext.Provider>
  );
};

export function useRoot(): TgpuRoot {
  const context = useContext(rootContext) ?? globalRootContextValue;

  const maybeRoot = context.initOrGetRoot();
  return maybeRoot instanceof Promise ? use(maybeRoot) : maybeRoot;
}
