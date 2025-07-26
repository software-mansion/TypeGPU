'use client';

import { atom, useAtomValue } from 'jotai';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';

const deferredCurrentExample = atom(async (get) => {
  await new Promise((r) => setTimeout(r, 500));
  return get(currentExampleAtom);
});

export default function CurrentMarker(
  props: { exampleKey: string | undefined },
) {
  const currentExample = useAtomValue(deferredCurrentExample);

  return (
    <div
      className='hidden'
      data-current-marker={currentExample === props.exampleKey}
    />
  );
}
