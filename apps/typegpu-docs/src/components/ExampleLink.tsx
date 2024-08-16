import cs from 'classnames';
import { useAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import type { MouseEvent } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { PLAYGROUND_KEY } from '../utils/examples/exampleContent';
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

  const active =
    currentExample === exampleKey ||
    (exampleKey === PLAYGROUND_KEY &&
      currentExample?.startsWith(PLAYGROUND_KEY));

  return (
    <a
      // Even though we prevent the default behavior of this link
      // it is good to have this set semantically.
      href={`#example=${exampleKey}`}
      onClick={handleClick}
      className={cs(
        'flex justify-between items-center cursor-pointer',
        active
          ? 'bg-clip-text bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark text-transparent'
          : '',
      )}>
      {children}

      {active ? <img src="/assets/selected-dot.svg" alt="" /> : null}
    </a>
  );
}
