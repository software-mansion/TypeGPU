import type { Wgsl } from './types';
import { code } from './wgslCode';

/**
 * Represent expressions as a comma-separated list.
 */
export const valueList = (elements: Wgsl[]): Wgsl[] => {
  return elements.map(
    (el, idx) => code`${el}${idx < elements.length - 1 ? ', ' : ''}`,
  );
};
