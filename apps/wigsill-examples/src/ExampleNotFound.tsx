import { useSetAtom } from 'jotai';

import useEvent from './common/useEvent';
import { currentExampleAtom } from './router';
import { MouseEvent } from 'react';

export function ExampleNotFound() {
  const setCurrentExample = useSetAtom(currentExampleAtom);

  const handleGoHome = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(undefined);
  });

  return (
    <div className="flex-1 flex flex-col justify-center items-center">
      <h1 className="text-4xl font-bold">404 Example Not Found</h1>
      <a
        href="#"
        className="mt-4 text-lg text-slate-600 underline"
        onClick={handleGoHome}>
        Go back home
      </a>
    </div>
  );
}
