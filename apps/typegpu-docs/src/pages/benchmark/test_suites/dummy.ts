import { Bench } from 'tinybench';
import { createSuite, type SuiteSetupOptions } from '../suites';
import { stringifyLocator } from '../parameter-set';

export const dummySuite = createSuite(
  (options: SuiteSetupOptions) => {
    const bench = new Bench({
      name: stringifyLocator('typegpu', options.params.typegpu),
      time: 1000,
    });

    return {
      bench,
      foo: 5,
    };
  },
  {
    dummy: (getCtx) => async () => {
      const { foo } = getCtx();
      await new Promise((resolve) => setTimeout(resolve, foo));
    },
  },
);
