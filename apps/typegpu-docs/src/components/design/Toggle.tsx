import type { ChangeEventHandler } from 'react';

type Props = {
  checked: boolean;
  id?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export function Toggle(props: Props) {
  return (
    <>
      <input type="checkbox" className="peer sr-only" {...props} />
      <div className="rtl:peer-checked:after:-translate-x-full relative box-border h-6 w-11 rounded-full bg-tameplum-50 after:absolute after:start-[2px] after:top-[2px] after:box-border after:h-5 after:w-5 after:rounded-full after:bg-tameplum-600 after:transition-all after:content-[''] peer-checked:bg-gradient-to-br peer-checked:from-gradient-purple peer-checked:to-gradient-blue peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:after:bg-grayscale-0 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gradient-blue" />
    </>
  );
}
