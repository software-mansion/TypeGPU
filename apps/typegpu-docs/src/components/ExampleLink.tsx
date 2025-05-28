import cs from 'classnames';
import { useAtom, useSetAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import type { MouseEvent } from 'react';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import { menuShownMobileAtom } from '../utils/examples/menuShownAtom.ts';
import useEvent from '../utils/useEvent.ts';

type Props = {
  exampleKey: string | undefined;
  children?: React.ReactNode;
};

export function ExampleLink(props: Props) {
  const { exampleKey, children } = props;

  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);
  const setMenuShownMobile = useSetAtom(menuShownMobileAtom);

  const handleClick = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(exampleKey ?? RESET);
    setMenuShownMobile(false);
  });

  const isCurrentExample = currentExample === exampleKey;

  return (
    <a
      // Even though we prevent the default behavior of this link
      // it is good to have this set semantically.
      href={`#example=${exampleKey}`}
      onClick={handleClick}
      className={cs(
        'block overflow-hidden rounded-lg border border-gray-200 bg-white no-underline transition-shadow',
        isCurrentExample
          ? 'shadow-lg ring-3 ring-purple-500'
          : 'hover:shadow-lg',
      )}
    >
      {children}
    </a>
  );
}
