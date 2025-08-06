import { setup } from '@ark/attest';

export default () =>
  setup({
    formatCmd: 'pnpm fix',
    updateSnapshots: true,
  });
