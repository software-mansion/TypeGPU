import { use, useContext } from 'react';
import type { TgpuRoot } from 'typegpu';
import { globalRootContextValue, rootContext } from '../context/root-context.tsx';

export function useRoot(): TgpuRoot {
  const context = useContext(rootContext) ?? globalRootContextValue;

  const maybeRoot = context.initOrGetRoot();
  return maybeRoot instanceof Promise ? use(maybeRoot) : maybeRoot;
}
