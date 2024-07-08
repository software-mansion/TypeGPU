import { arrayOf as tbArrayOf } from 'typed-binary';
import { code } from '../wgslCode';
import { SimpleWGSLDataType } from './std140';
import { AnyWGSLDataType } from './types';

export const arrayOf = <TSchema extends AnyWGSLDataType>(
  elementType: TSchema,
  size: number,
) =>
  new SimpleWGSLDataType({
    schema: tbArrayOf(elementType, size),
    byteAlignment: elementType.byteAlignment,
    code: code`array<${elementType}, ${size}>`,
  });
