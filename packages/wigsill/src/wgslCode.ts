import {
  IResolutionCtx,
  WGSLCompoundTrait,
  WGSLItem,
  WGSLSegment,
  isWGSLItem,
} from './types';

export class WGSLCode implements WGSLItem, WGSLCompoundTrait {
  constructor(public readonly segments: WGSLSegment[]) {}

  getChildren(): WGSLItem[] {
    return this.segments.filter(isWGSLItem);
  }

  resolve(ctx: IResolutionCtx) {
    let code = '';

    for (const s of this.segments) {
      if (isWGSLItem(s)) {
        code += ctx.resolve(s);
      } else {
        code += String(s);
      }
    }

    return code;
  }
}

export function code(
  strings: TemplateStringsArray,
  ...params: (WGSLSegment | WGSLSegment[])[]
): WGSLCode {
  console.log(params);
  console.log(strings);
  const segments: WGSLSegment[] = strings.flatMap((string, idx) => {
    if (idx >= params.length) {
      return [string];
    }

    const param = params[idx]!;
    return param instanceof Array ? [string, ...param] : [string, param];
  });

  return new WGSLCode(segments);
}
