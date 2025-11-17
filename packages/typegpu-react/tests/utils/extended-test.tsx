import { test as base } from 'typegpu-testing-utility';
import { Root } from '@typegpu/react';

export const test = base.extend('RootWrapper', async ({ root }) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return <Root root={root}>{children}</Root>;
  };

  return Wrapper;
});

export const it = test;
