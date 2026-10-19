import { useAtom } from 'jotai';
import { useId } from 'react';
import { tsoverUsedAtom } from '../../utils/examples/exampleViewStateAtoms.ts';
import { Toggle } from './Toggle.tsx';

export function TsoverSwitch() {
  const [tsoverUsed, setTsoverUsed] = useAtom(tsoverUsedAtom);
  const id = useId();

  return (
    <label
      htmlFor={id}
      className="flex h-full shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-tameplum-600 dark:text-gray-300"
    >
      <span>tsover</span>
      <Toggle id={id} checked={tsoverUsed} onChange={(e) => setTsoverUsed(e.target.checked)} />
    </label>
  );
}
