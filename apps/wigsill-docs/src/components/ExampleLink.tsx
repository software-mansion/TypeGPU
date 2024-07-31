import cs from 'classnames';
import { useAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import type { MouseEvent } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import useEvent from '../utils/useEvent';

type Props = {
  exampleKey: string | undefined;
  children?: string;
};

export function ExampleLink(props: Props) {
  const { exampleKey, children } = props;

  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);

  const handleClick = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(exampleKey ?? RESET);
  });

  const active = currentExample === exampleKey;

  return (
    <a
      // Even though we prevent the default behavior of this link
      // it is good to have this set semantically.
      href={`#example=${exampleKey}`}
      onClick={handleClick}
      className={cs(
        'block px-2 py-1 border-l rounded text-left transition-all',
        active
          ? 'border-gray-500 text-black'
          : 'border-transparent text-gray-600',
      )}
    >
      {children}
    </a>
  );
}
