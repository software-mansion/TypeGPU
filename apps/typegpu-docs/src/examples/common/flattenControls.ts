import type { ControlSection } from './defineControls.ts';

export type ControlOptions<T> = Record<string, T | ControlSection | false>;

export function isControlSection(value: unknown): value is ControlSection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isSection' in value &&
    value.isSection === true &&
    'controls' in value
  );
}

type ControlEntry<T> = {
  label: string;
  path: readonly string[];
  value: T | ControlSection;
};

/** Yields each section header followed by its controls, in panel order. */
export function* flattenControls<T>(
  options: ControlOptions<T>,
  parentPath: readonly string[] = [],
): Generator<ControlEntry<T>> {
  for (const [label, value] of Object.entries(options)) {
    if (!value) {
      continue;
    }

    const path = [...parentPath, label];
    yield { label, path, value };
    if (isControlSection(value)) {
      yield* flattenControls(value.controls as ControlOptions<T>, path);
    }
  }
}
