import * as TB from 'typed-binary';
import { code } from '../wgslCode';
import { SimpleWgslData } from './std140';
import type { AnyWgslData, WgslData } from './types';

type WgslArray<TElement extends AnyWgslData> = WgslData<TB.Unwrap<TElement>[]>;

export const arrayOf = <TElement extends AnyWgslData>(
  elementType: TElement,
  size: number,
): WgslArray<TElement> =>
  new SimpleWgslData({
    schema: TB.arrayOf(elementType, size),
    byteAlignment: elementType.byteAlignment,
    code: code`array<${elementType}, ${size}>`,
  });
