import cs from 'classnames';
import { useAtom, useSetAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import type { MouseEvent } from 'react';
import SelectedDotSvg from '../assets/selected-dot.svg';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { PLAYGROUND_KEY } from '../utils/examples/exampleContent';
import { menuShownMobileAtom } from '../utils/examples/menuShownAtom';
import { sandboxShownAtom } from '../utils/examples/sandboxShownAtom';
import useEvent from '../utils/useEvent';

type Props = {
  exampleKey: string | undefined;
  children?: string;
};

export function ExampleLink(props: Props) {
  const { exampleKey, children } = props;

  const [currentExample, setCurrentExample] = useAtom(currentExampleAtom);
  const setMenuShownMobile = useSetAtom(menuShownMobileAtom);
  const setSandboxShow = useSetAtom(sandboxShownAtom);

  const handleClick = useEvent((e: MouseEvent) => {
    e.preventDefault();
    setCurrentExample(exampleKey ?? RESET);
    setMenuShownMobile(false);
    setSandboxShow(false);
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
        'flex justify-between items-center cursor-pointer no-underline',
        active
          ? 'bg-clip-text bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark text-transparent'
          : 'text-black',
      )}
    >
      {children}

      {active ? <img src={SelectedDotSvg.src} alt="" /> : null}
    </a>
  );
}
