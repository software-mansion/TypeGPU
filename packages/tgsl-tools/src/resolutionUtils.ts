import { type Wgsl, wgsl } from 'typegpu/experimental';

/**
 * Represent expressions as a comma-separated list.
 */
export const valueList = (elements: Wgsl[]): Wgsl[] => {
  return elements.map(
    (el, idx) => wgsl`${el}${idx < elements.length - 1 ? ', ' : ''}`,
  );
};
