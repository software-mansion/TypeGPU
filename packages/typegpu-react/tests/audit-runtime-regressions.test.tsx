import { Suspense, startTransition, useState } from 'react';
import { act, render } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { useBuffer, useConfigureContext } from '@typegpu/react';
import { d, type TgpuBuffer } from 'typegpu';
import { it } from './utils/extended-test.tsx';

it('B11 retains the committed buffer while a schema-changing transition is suspended', async ({
  RootWrapper,
}) => {
  let committedBuffer: TgpuBuffer<d.WgslArray<d.F32>> | undefined;
  let changeCount: (() => void) | undefined;
  const pending = new Promise<void>(() => {});

  function Child() {
    const [count, setCount] = useState(1);
    changeCount = () => setCount(2);
    const buffer = useBuffer(d.arrayOf(d.f32, count));
    if (count === 1) {
      committedBuffer = buffer;
    }
    if (count === 2) {
      throw pending;
    }
    return <div>Committed old buffer</div>;
  }

  const view = render(
    <RootWrapper>
      <Suspense fallback="Loading">
        <Child />
      </Suspense>
    </RootWrapper>,
  );
  expect(committedBuffer?.destroyed).toBe(false);
  expect(changeCount).toBeDefined();

  await act(async () => {
    startTransition(() => changeCount!());
  });

  expect(view.getByText('Committed old buffer')).toBeTruthy();
  expect(view.queryByText('Loading')).toBeNull();
  expect(committedBuffer?.destroyed).toBe(false);
});

it('B57 retains the canvas configuration on unrelated parent renders', ({ root, RootWrapper }) => {
  using configureContext = vi.spyOn(root, 'configureContext').mockImplementation(({ canvas }) => {
    return {
      __brand: 'GPUCanvasContext',
      canvas,
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getConfiguration: vi.fn(() => null),
      getCurrentTexture: vi.fn(),
    };
  });

  function Canvas({ label }: { label: string }) {
    const { ref } = useConfigureContext({ autoResize: false });
    return <canvas ref={ref} aria-label={label} />;
  }

  const view = render(<Canvas label="before" />, { wrapper: RootWrapper });
  expect(configureContext).toHaveBeenCalledTimes(1);
  view.rerender(<Canvas label="after" />);
  expect(configureContext).toHaveBeenCalledTimes(1);
});
