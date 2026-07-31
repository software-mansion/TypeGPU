import type { d } from 'typegpu';
import type { ControlSection } from './defineControls.ts';

export type FlatSectionParam = {
  isSection: true;
  label: string;
};

export type FlatLabeledControl = Record<string, unknown> & { label: string };

export type FlatControlParam = FlatSectionParam | FlatLabeledControl;

export function isControlSection(value: unknown): value is ControlSection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isSection' in value &&
    Boolean((value as ControlSection).isSection) &&
    'controls' in value
  );
}

export function isFlatSection(param: FlatControlParam): param is FlatSectionParam {
  return 'isSection' in param && Boolean(param.isSection);
}

/**
 * Flattens `defineControls` / `section()` trees into a linear list for the control panel.
 * Only recognizes explicit `section()` wrappers — plain nested objects are not sections.
 */
export function flattenControls(options: Record<string, unknown>): FlatControlParam[] {
  const result: FlatControlParam[] = [];

  for (const [label, value] of Object.entries(options)) {
    if (!value) {
      continue;
    }

    if (isControlSection(value)) {
      result.push({ label, isSection: true });
      result.push(...flattenControls(value.controls));
      continue;
    }

    if (typeof value === 'object') {
      result.push({
        ...(value as Record<string, unknown>),
        label,
      });
    }
  }

  return result;
}

/** Eagerly apply each control's initial value. */
export function initializeControlParam(param: FlatLabeledControl): void {
  if ('onSelectChange' in param) {
    (param.onSelectChange as (v: string) => void)(param.initial as string);
    return;
  }
  if ('onToggleChange' in param) {
    (param.onToggleChange as (v: boolean) => void)(param.initial as boolean);
    return;
  }
  if ('onSliderChange' in param) {
    (param.onSliderChange as (v: number) => void)(param.initial as number);
    return;
  }
  if ('onVectorSliderChange' in param) {
    (param.onVectorSliderChange as (v: d.v2f | d.v3f | d.v4f) => void)(
      param.initial as d.v2f | d.v3f | d.v4f,
    );
    return;
  }
  if ('onColorChange' in param) {
    (param.onColorChange as (v: d.v3f) => void)(param.initial as d.v3f);
    return;
  }
  if ('onTextChange' in param) {
    (param.onTextChange as (v: string) => void)(param.initial as string);
  }
}
