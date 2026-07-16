import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrame } from '../../src/react-native/core/use-frame.ts';

const holder = vi.hoisted(() => ({
  worklets: null as object | null,
}));

vi.mock('../../src/react-native/worklets-integration.ts', () => ({
  getWorkletsModule: () => holder.worklets,
}));

function FrameUser({ cb }: { cb: (ctx: unknown) => void }) {
  useFrame(cb);
  return null;
}

describe('react-native useFrame dispatch', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    holder.worklets = null;
    vi.unstubAllGlobals();
  });

  it('runs on the JS thread when worklets are unavailable', () => {
    const cb = vi.fn();

    const { unmount } = render(<FrameUser cb={cb} />);

    expect(cb).toHaveBeenCalledWith({ deltaSeconds: 0, elapsedSeconds: 0 });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('never dispatches plain callbacks to the UI runtime even with worklets installed', () => {
    const runOnUISync = vi.fn();
    holder.worklets = {
      isWorkletFunction: (value: unknown) =>
        typeof value === 'function' && !!(value as { __workletHash?: unknown }).__workletHash,
      runOnUISync,
      createShareable: vi.fn(),
      UIRuntimeId: 1,
    };
    const cb = vi.fn();

    render(<FrameUser cb={cb} />);

    expect(runOnUISync).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith({ deltaSeconds: 0, elapsedSeconds: 0 });
  });
});
