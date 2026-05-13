import type { ReactNode } from 'react';

type NumberCellProps = {
  ariaLabel?: string;
  highlight: boolean;
  label?: ReactNode;
  value: number;
};

function NumberCell({ ariaLabel, highlight, label, value }: NumberCellProps) {
  if (label !== undefined) {
    return (
      <div
        aria-label={ariaLabel}
        className={`grid h-8 min-w-0 grid-rows-[auto_1fr] rounded-sm border bg-[var(--sl-color-bg)] px-1 py-0.5 text-center ${
          highlight ? 'border-[var(--sl-color-accent)]' : 'border-[var(--sl-color-gray-5)]'
        }`}
      >
        <span className="font-mono text-[0.65rem] leading-none text-[var(--sl-color-gray-3)]">
          {label}
        </span>
        <span
          className={`flex items-center justify-center font-mono text-xs font-semibold leading-none ${
            highlight ? 'text-[var(--sl-color-text-accent)]' : 'text-[var(--sl-color-text)]'
          }`}
        >
          {value}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`flex h-8 min-w-0 items-center justify-center rounded-sm border bg-[var(--sl-color-bg)] px-1 text-center font-mono text-xs font-semibold leading-none ${
        highlight
          ? 'border-[var(--sl-color-accent)] text-[var(--sl-color-text-accent)]'
          : 'border-[var(--sl-color-gray-5)] text-[var(--sl-color-text)]'
      }`}
    >
      {value}
    </div>
  );
}

type LinearCellGridProps = {
  columns: number;
  highlightCount: number;
  showIndices?: boolean;
  values: readonly number[];
};

export function LinearCellGrid({
  columns,
  highlightCount,
  showIndices = true,
  values,
}: LinearCellGridProps) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {values.map((value, index) => (
        <NumberCell
          ariaLabel={`Index ${index}: ${value}`}
          highlight={index < highlightCount}
          key={index}
          label={showIndices ? index : undefined}
          value={value}
        />
      ))}
    </div>
  );
}

type RectangleHighlight = {
  height: number;
  width: number;
};

type RectangleCellGridProps = {
  height: number;
  highlight: RectangleHighlight | null;
  values: readonly (readonly number[])[];
  width: number;
};

export function RectangleCellGrid({ height, highlight, values, width }: RectangleCellGridProps) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
      {Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => {
          const value = values[x]?.[y] ?? 0;
          const isHighlighted = highlight !== null && x < highlight.width && y < highlight.height;

          return (
            <NumberCell
              ariaLabel={`Column ${x}, row ${y}: ${value}`}
              highlight={isHighlighted}
              key={`${x}-${y}`}
              value={value}
            />
          );
        }),
      )}
    </div>
  );
}
