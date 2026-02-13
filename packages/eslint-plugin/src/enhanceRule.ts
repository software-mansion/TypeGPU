import type {
  RuleContext,
  RuleListener,
} from '@typescript-eslint/utils/ts-eslint';

export type RuleEnhancer<TState> = (
  context: RuleContext<string, unknown[]>,
) => {
  visitors: RuleListener;
  state: TState;
};

type State<TMap extends Record<string, RuleEnhancer<unknown>>> = {
  [K in keyof TMap]: TMap[K] extends RuleEnhancer<infer S> ? S : never;
};

/**
 * Allows enhancing rule code with additional context provided by RuleEnhancers (reusable node visitors collecting data).
 * @param enhancers a record of RuleEnhancers
 * @param rule a visitor with an additional `state` argument that allows access to the enhancers' data
 * @returns a resulting `(context: Context) => RuleListener` function
 *
 * @example
 * // inside of `createRule`
 *   create: enhanceRule({ metadata: metadataTrackingEnhancer }, (context, state) => {
 *     const { metadata } = state;
 *
 *     return {
 *       ObjectExpression(node) {
 *         if (metadata.shouldReport()) {
 *           context.report({ node, messageId: 'error' });
 *         }
 *       },
 *     };
 */
export function enhanceRule<
  TMap extends Record<string, RuleEnhancer<unknown>>,
  Context extends RuleContext<string, unknown[]>,
>(
  enhancers: TMap,
  rule: (context: Context, state: State<TMap>) => RuleListener,
) {
  return (context: Context) => {
    const enhancerVisitors: RuleListener[] = [];
    const combinedState: Record<string, unknown> = {};

    for (const [key, enhancer] of Object.entries(enhancers)) {
      const initializedEnhancer = enhancer(context);
      enhancerVisitors.push(initializedEnhancer.visitors);
      combinedState[key] = initializedEnhancer.state;
    }

    const initializedRule = rule(context, combinedState as State<TMap>);

    return mergeVisitors([...enhancerVisitors, initializedRule]);
  };
}

/**
 * Merges all passed visitors into one visitor.
 * Retains visitor order:
 * - on node enter, visitors are called in `visitorsList` order,
 * - on node exit, visitors are called in reversed order.
 */
function mergeVisitors(visitors: RuleListener[]): RuleListener {
  const merged: RuleListener = {};

  const allKeys = new Set(visitors.flatMap((v) => Object.keys(v)));

  for (const key of allKeys) {
    const listeners = visitors
      .map((v) => v[key])
      .filter((fn) => fn !== undefined);

    if (listeners.length === 0) {
      continue;
    }

    // Reverse order if node is an exit node
    if (key.endsWith(':exit')) {
      listeners.reverse();
    }

    merged[key] = (...args: unknown[]) => {
      // biome-ignore lint/suspicious/useIterableCallbackReturn: those functions return void
      listeners.forEach((fn) => (fn as (...args: unknown[]) => void)(...args));
    };
  }

  return merged;
}
