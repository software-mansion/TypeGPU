import { useSetAtom } from 'jotai';
import type { MouseEvent } from 'react';
import useEvent from './common/useEvent';
import { currentExampleAtom } from './router';

export function ExampleNotFound() {
  const setCurrentExample = useSetAtom(currentExampleAtom);

  const handleGoHome = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(undefined);
  });

  return (
    <div className="flex-1 flex flex-col justify-center items-center">
      <h1 className="text-4xl font-bold">404 Example Not Found</h1>
      <button
        type="button"
        className="mt-4 text-lg text-slate-600 underline"
        onClick={handleGoHome}
      >
        Go back home
      </button>
    </div>
  );
}
