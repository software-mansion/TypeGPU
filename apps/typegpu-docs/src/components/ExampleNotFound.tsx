import { useSetAtom } from 'jotai';
import type { MouseEvent } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import useEvent from '../utils/useEvent.ts';

export function ExampleNotFound() {
  const setCurrentExample = useSetAtom(currentExampleAtom);

  const handleGoHome = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(undefined);
  });

  return (
    <div className='flex flex-1 flex-col items-center justify-center'>
      <h1 className='font-bold text-4xl'>404 Example Not Found</h1>
      <button
        type='button'
        className='mt-4 text-lg text-slate-600 underline'
        onClick={handleGoHome}
      >
        Go back home
      </button>
    </div>
  );
}
