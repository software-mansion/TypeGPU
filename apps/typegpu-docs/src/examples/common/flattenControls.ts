import type { ControlSection } from './defineControls.ts';

type ControlMap<T = unknown> = Record<string, T | false>;
export type ControlOptions<T extends object> = ControlMap<T | ControlSection<ControlMap<T>>>;

type VisibleControl<T> =
  T extends ControlSection<infer Children>
    ? T | VisibleControl<Children[keyof Children]>
    : Exclude<T, false>;

export function isControlSection(value: unknown): value is ControlSection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isSection' in value &&
    value.isSection === true &&
    'controls' in value &&
    typeof value.controls === 'object' &&
    value.controls !== null &&
    !Array.isArray(value.controls)
  );
}

type ControlEntry<T> = {
  label: string;
  path: readonly string[];
  value: T;
};

/** Yields each section header followed by its controls, in panel order. */
export function flattenControls<const T extends ControlMap>(
  options: T,
  parentPath?: readonly string[],
): Generator<ControlEntry<VisibleControl<T[keyof T]>>>;
export function* flattenControls(
  options: ControlMap,
  parentPath: readonly string[] = [],
): Generator<ControlEntry<unknown>> {
  for (const [label, value] of Object.entries(options)) {
    if (!value) {
      continue;
    }

    const path = [...parentPath, label];
    yield { label, path, value };
    if (isControlSection(value)) {
      yield* flattenControls(value.controls, path);
    }
  }
}
