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
        'focus:ring-2 focus:ring-gradient-blue rounded-[6.25rem] text-sm px-5 py-2.5',
        accent
          ? 'bg-gradient-to-br from-gradient-purple to-gradient-blue text-white hover:from-gradient-purple-dark hover:to-gradient-blue-dark'
          : 'border-grayscale-20 border-2 hover:border-gradient-purple-dark',
      )}
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {label}
    </button>
  );
});
