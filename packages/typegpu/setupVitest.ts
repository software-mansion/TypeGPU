import { setup } from '@ark/attest';
import { type } from 'arktype';

const truthyString = type('"0"|"1"').pipe.try((value) => Boolean(Number.parseInt(value)));

const ProcessEnvType = type({
  'ENABLE_ATTEST?': type.or(truthyString, 'undefined'),
});

const env = ProcessEnvType.assert(process.env);

export default () =>
  setup({
    formatCmd: 'pnpm fix',
    // Skipping type tests by default
    skipTypes: !env.ENABLE_ATTEST,
  });
