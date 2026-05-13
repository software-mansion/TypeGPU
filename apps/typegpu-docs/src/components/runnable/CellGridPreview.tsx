import type { ReactNode } from 'react';

function cx(...classes: Array<false | string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type NumberCellProps = {
  ariaLabel?: string;
  highlight: boolean;
  label?: ReactNode;
  square?: boolean;
  value: number;
};

function NumberCell({ ariaLabel, highlight, label, square = false, value }: NumberCellProps) {
  const hasLabel = label !== undefined;

  return (
    <div
      aria-label={ariaLabel}
      className={cx(
        'grid min-w-0 rounded-sm border bg-[var(--sl-color-bg)] px-1 text-center',
        highlight
          ? 'border-[var(--sl-color-accent)] text-[var(--sl-color-text-accent)]'
          : 'border-[var(--sl-color-gray-5)] text-[var(--sl-color-text)]',
        hasLabel ? 'grid-rows-[auto_1fr] py-0.5' : 'place-items-center',
        square ? 'aspect-square' : 'h-8',
      )}
    >
      {hasLabel ? (
        <span className="font-mono text-[0.6rem] leading-none text-[var(--sl-color-gray-3)]">
          {label}
        </span>
      ) : null}
      <span
        className={cx(
          'font-mono leading-none',
          hasLabel && 'flex items-center justify-center',
          square ? 'text-[0.7rem] font-medium' : 'text-xs font-semibold',
        )}
      >
        {value}
      </span>
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
  const compactGrid = columns > 8;

  return (
    <div
      className={compactGrid ? 'grid gap-1' : 'grid gap-1.5'}
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
    <div
      className="mx-auto grid w-full max-w-96 gap-1"
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: height * width }, (_, index) => {
        const x = index % width;
        const y = Math.floor(index / width);
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
      })}
    </div>
  );
}
