import { code } from './tgpuCode';
import type { ResolutionCtx, TgpuResolvable } from './types';

export class TgpuBuiltin implements TgpuResolvable {
  public readonly s: symbol;

  constructor(public name: string) {
    this.s = Symbol(name);
  }

  get label() {
    return this.name;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this.s}`);
  }
}
