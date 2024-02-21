import { ISchema } from 'typed-binary';
import type { WGSLItem } from '../types';

export interface WGSLDataType<TInner> extends ISchema<TInner>, WGSLItem {
  readonly baseAlignment: number;
  readonly size: number;
}

export type AnyWGSLDataType = WGSLDataType<unknown>;
