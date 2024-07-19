import type { TableRef } from '@wigsill/example-toolkit';
import { forwardRef, useImperativeHandle, useState } from 'react';

type Props = {
  label?: string;
};

export const Table = forwardRef<TableRef, Props>((props, ref) => {
  const { label } = props;

  const [matrix, setMatrix] = useState<number[][]>([]);

  useImperativeHandle(ref, () => ({ setMatrix }));

  return (
    <div className="grid place-items-center font-semibold gap-2">
      <div className="text-slate-600">{label}</div>
      <div
        className="grid gap-2 bg-slate-300 p-4 rounded"
        style={{
          gridTemplateColumns: `repeat(${matrix[0]?.length ?? 0}, 1fr)`,
        }}
      >
        {matrix.flatMap((row) =>
          row.map((value) => (
            <div
              className="p-2 grid place-items-center text-slate-600"
              key={value}
            >
              {value}
            </div>
          )),
        )}
      </div>
    </div>
  );
});
