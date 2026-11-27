import { expect, it } from 'vitest';
import { section } from '../../src/examples/common/defineControls.ts';
import { flattenControls } from '../../src/examples/common/flattenControls.ts';

it('skips empty sections and preserves the order and paths of visible controls', () => {
  const button = { onButtonClick() {} };
  const controls = {
    Before: button,
    Empty: section({}),
    Debug: section({ Inspect: false }),
    Camera: section({ Hidden: false, Reset: button, Center: button }),
    Light: section({ Reset: button }),
    After: button,
  };

  expect([...flattenControls(controls)].map(({ path }) => path)).toEqual([
    ['Before'],
    ['Camera'],
    ['Camera', 'Reset'],
    ['Camera', 'Center'],
    ['Light'],
    ['Light', 'Reset'],
    ['After'],
  ]);
});
