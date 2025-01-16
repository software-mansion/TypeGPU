import type { Labelled, ResolutionCtx, SelfResolvable } from '../types';

export const valueProxyHandler: ProxyHandler<SelfResolvable & Labelled> = {
  get(target, prop) {
    if (prop in target) {
      return Reflect.get(target, prop);
    }

    return new Proxy(
      {
        '~resolve'(ctx: ResolutionCtx) {
          return `${ctx.resolve(target)}.${String(prop)}`;
        },

        toString() {
          return `.value:${target.label ?? '<unnamed>'}`;
        },
      },
      valueProxyHandler,
    );
  },
};
