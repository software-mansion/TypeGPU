import { forwardRef } from 'react';

type Props = {
  label?: string;
  onClick?: () => void;
};

export const Button = forwardRef<HTMLButtonElement, Props>((props, ref) => {
  const { label, onClick } = props;

  return (
    <button
      className="text-white bg-gradient-to-br from-gradient-purple to-gradient-blue hover:from-gradient-purple-dark hover:to-gradient-blue-dark focus:ring-2 focus:ring-gradient-blue font-medium rounded-[6.25rem] text-sm px-5 py-2.5"
      type="button"
      ref={ref}
      onClick={onClick}
    >
      {label}
    </button>
  );
});
