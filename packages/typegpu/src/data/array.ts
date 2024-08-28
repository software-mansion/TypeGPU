import * as TB from 'typed-binary';
import type { AnyWgslData, WgslData } from '../future/types';
import { code } from '../future/wgslCode';
import { SimpleWgslData } from './std140';

export type WgslArray<TElement extends AnyWgslData> = WgslData<
  TB.Unwrap<TElement>[]
>;

export const arrayOf = <TElement extends AnyWgslData>(
  elementType: TElement,
  size: number,
): WgslArray<TElement> =>
  new SimpleWgslData({
    schema: TB.arrayOf(elementType, size),
    byteAlignment: elementType.byteAlignment,
    code: code`array<${elementType}, ${size}>`,
  });
