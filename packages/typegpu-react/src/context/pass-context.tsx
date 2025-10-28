import { createContext } from 'react';
import type { RenderPass } from '../../../typegpu/src/core/root/rootTypes.ts'; // TODO: Expose it in typegpu

export interface PassContextValue {
  addDrawCall: (cb: (pass: RenderPass) => void) => () => void;
}

export const PassContext = createContext<PassContextValue | null>(null);
