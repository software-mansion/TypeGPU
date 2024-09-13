import cs from 'classnames';
import { forwardRef } from 'react';

type Props = {
  label?: string;
  accent?: boolean;
  onClick?: () => void;
};

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { label, onClick, accent } = props;

  return (
    <button
      className={cs(
        'from-gradient-purple to-gradient-blue focus:ring-2 focus:ring-gradient-blue rounded-[6.25rem] text-sm px-5 py-2.5',
        accent
          ? 'bg-gradient-to-br text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
          : 'hover:bg-gradient-to-br border-grayscale-20 hover:border-none border-2 hover:from-gradient-purple hover:to-gradient-blue',
      )}
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {label}
    </button>
  );
});
