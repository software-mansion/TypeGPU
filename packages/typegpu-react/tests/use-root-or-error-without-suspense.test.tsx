import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { useRootOrError } from '@typegpu/react';
import { it } from './utils/extended-test.tsx';

// Own file: needs a pristine global root. Only fails without the fix on React 19.3+.

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

it('should not make React complain when useRootOrError suspends with no Suspense boundary above', async ({
  stallDeviceRequest,
}) => {
  function App() {
    useRootOrError();
    return <div data-testid="ready">ready</div>;
  }

  const resume = stallDeviceRequest();
  await act(async () => {
    render(<App />);
  });
  expect(screen.queryByTestId('ready')).toBeNull();

  await resume();
  await flush();

  expect(screen.getByTestId('ready')).toBeDefined();
  expect(errorSpy).not.toHaveBeenCalled();
});
