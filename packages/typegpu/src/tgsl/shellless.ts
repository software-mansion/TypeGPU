import type { TgpuFn } from '../core/function/tgpuFn.ts';
import { getMetaData } from '../shared/meta.ts';

export class ShelllessRepository {
  constructor() {
  }

  getShelled(fn: (...args: never[]) => unknown): TgpuFn | undefined {
    const meta = getMetaData();
  }
}
