import type { Wgsl } from './types';
import { code } from './wgslCode';

export const valueList = (elements: Wgsl[]): Wgsl[] => {
  return elements.map(
    (el, idx) => code`${el}${idx < elements.length - 1 ? ', ' : ''}`,
  );
};
