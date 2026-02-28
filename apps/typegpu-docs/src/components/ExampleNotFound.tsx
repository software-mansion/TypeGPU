import { useSetAtom } from 'jotai';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import useEvent from '../utils/useEvent.ts';
import { Button } from './design/Button.tsx';

export function ExampleNotFound() {
  const setCurrentExample = useSetAtom(currentExampleAtom);

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4">
      <h1 className="font-bold text-3xl">Example Not Found</h1>
      <Button
        accent
        onClick={useEvent(() => {
          setCurrentExample(undefined);
        })}
      >
        Show default example
      </Button>
    </div>
  );
}
