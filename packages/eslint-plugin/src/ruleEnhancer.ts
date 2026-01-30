import type {
  RuleContext,
  RuleListener,
} from '@typescript-eslint/utils/ts-eslint';

export type RuleEnhancer<TState> = (context: RuleContext) => {
  visitors: RuleListener;
  state: TState;
};

type InferState<T> = T extends RuleEnhancer<infer S> ? S : never;

export function enhanceRule<
  TMap extends Record<string, RuleEnhancer<unknown>>,
  Context extends RuleContext<string, unknown[]>,
>(
  enhancers: TMap,
  rule: (
    context: Context,
    state: { [K in keyof TMap]: InferState<TMap[K]> },
  ) => RuleListener,
): (context: Context) => RuleListener {
  return (context: Context) => {
    const enhancerVisitors: RuleListener[] = [];
    const combinedState: any = {};

    // A. Initialize every enhancer
    for (const [key, enhancer] of Object.entries(enhancers)) {
      const result = enhancer(context);
      enhancerVisitors.push(result.visitors);
      combinedState[key] = result.state;
    }

    // B. Initialize the user's rule with the fully constructed state
    const userRuleVisitor = rule(context, combinedState);

    // C. Merge visitors: Enhancers first, User Rule last
    // (smartMerge handles the reversal for :exit automatically)
    return smartMerge([...enhancerVisitors, userRuleVisitor]);
  };
}

function smartMerge(visitorsList: RuleListener[]): RuleListener {
  const merged: RuleListener = {};

  // Get unique keys from all visitors
  const allKeys = new Set(visitorsList.flatMap((v) => Object.keys(v)));

  for (const key of allKeys) {
    const listeners = visitorsList
      .map((v) => v[key])
      .filter((fn): fn is Function => typeof fn === 'function');

    if (listeners.length === 0) continue;

    // "Onion" Architecture:
    // Entry nodes: [Enhancer 1, Enhancer 2, Rule] -> Setup in order
    // Exit nodes:  [Rule, Enhancer 2, Enhancer 1] -> Teardown in reverse
    if (key.endsWith(':exit')) {
      listeners.reverse();
    }

    // Create the merged listener
    merged[key] = (...args: unknown[]) => {
      listeners.forEach((fn) => fn(...args));
    };
  }

  return merged;
}
