import { expectTypeOf, it } from 'vitest';
import { defineControls, section } from '../../src/examples/common/defineControls.ts';
import type { ExampleControlOptions } from '../../src/utils/examples/exampleRunner.ts';

it('preserves option types for controls passed to the example runner', () => {
  const { Rendering, samples } = defineControls({
    Rendering: section({
      mode: {
        initial: 'fast',
        options: ['fast', 'precise'],
        onSelectChange: (_mode) => {},
      },
    }),
    samples: {
      initial: 1,
      options: [1, 4],
      onSelectChange: (_samples) => {},
    },
  }) satisfies ExampleControlOptions;

  expectTypeOf(Rendering.controls.mode.initial).toEqualTypeOf<'fast'>();
  expectTypeOf(Rendering.controls.mode.onSelectChange)
    .parameter(0)
    .toEqualTypeOf<'fast' | 'precise'>();
  expectTypeOf(samples.options).toEqualTypeOf<[1, 4]>();
  expectTypeOf(samples.onSelectChange).parameter(0).toEqualTypeOf<1 | 4>();
  expectTypeOf({
    samples: { ...samples, onSelectChange: Rendering.controls.mode.onSelectChange },
  }).not.toExtend<ExampleControlOptions>();
});

it('rejects misspelled options and incompatible callbacks on a slider', () => {
  const onSliderChange = (_value: number) => {};

  // @ts-expect-error -- the slider option is named max
  defineControls({ speed: { initial: 1, maxx: 5, onSliderChange } });
  // @ts-expect-error -- the slider option is named step
  section({ speed: { initial: 1, stpe: 0.1, onSliderChange } });
  // @ts-expect-error -- the runner would try to call this as a select handler
  defineControls({ speed: { initial: 1, onSelectChange: false, onSliderChange } });
});
