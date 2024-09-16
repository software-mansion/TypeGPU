import type { TableRef } from '@typegpu/example-toolkit';
import { forwardRef, useImperativeHandle, useState } from 'react';

type Props = {
  label?: string;
};

export const Table = forwardRef<TableRef, Props>((props, ref) => {
  const { label } = props;

  const [matrix, setMatrix] = useState<number[][]>([]);

  useImperativeHandle(ref, () => ({ setMatrix }));

  return (
    <div className="grid place-items-center font-medium gap-2">
      <div>{label}</div>
      <div
        className="grid gap-2 bg-grayscale-0 p-4 rounded"
        style={{
          gridTemplateColumns: `repeat(${matrix[0]?.length ?? 0}, 1fr)`,
        }}
      >
        {matrix.flatMap((row, rowIndex) =>
          row.map((value, index) => (
            <div
              className="p-2 grid place-items-center text-slate-600"
              key={`${value} ${rowIndex} ${index * 1}`}
            >
              {value}
            </div>
          )),
        )}
      </div>
    </div>
  );
});
