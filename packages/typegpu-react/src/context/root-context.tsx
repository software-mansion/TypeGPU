import { createContext } from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';

export class RootContext {
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
export const globalRootContextValue = new RootContext();

export const rootContext = createContext<RootContext | null>(null);