import * as RadixSelect from '@radix-ui/react-select';

export function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger className='flex justify-between items-center w-full h-10 border border-tameplum-100 hover:border-tameplum-600 rounded px-3 text-sm bg-tameplum-50'>
        <RadixSelect.Value>{value}</RadixSelect.Value>
        <RadixSelect.Icon />
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position='popper'
          className='relative -top-4 min-w-30'
        >
          <RadixSelect.Viewport className='rounded bg-tameplum-50'>
            {options.map((option) => (
              <RadixSelect.Item
                key={option}
                value={option}
                className='flex items-center justify-between p-3 text-sm hover:bg-linear-to-br hover:from-gradient-purple hover:to-gradient-blue hover:text-grayscale-0'
              >
                <RadixSelect.ItemText>{option}</RadixSelect.ItemText>
                {option === value && (
                  <RadixSelect.Icon className='px-3'>
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      width='12'
                      height='9'
                      viewBox='0 0 12 9'
                      fill='none'
                    >
                      <title>checkmark</title>
                      <path
                        d='M4.36641 8.99973L0.566406 5.19973L1.51641 4.24973L4.36641 7.09973L10.4831 0.983063L11.4331 1.93306L4.36641 8.99973Z'
                        fill='black'
                      />
                    </svg>
                  </RadixSelect.Icon>
                )}
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
