import { ResolutionCtx, WGSLItem, WGSLSegment, isWGSLItem } from './types';

export class WGSLCode implements WGSLItem {
  constructor(public readonly segments: WGSLSegment[]) {}

  resolve(ctx: ResolutionCtx) {
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

  getChildItems(ctx: ResolutionCtx): WGSLItem[] {
    const items: WGSLItem[] = [];
    for (const s of this.segments) {
      if (isWGSLItem(s)) {
        items.push(s);
        const childItems = s.getChildItems(ctx);
        items.push(...new Set(childItems));
      }
    }
    return items;
  }
}

export function code(
  strings: TemplateStringsArray,
  ...params: (WGSLSegment | WGSLSegment[])[]
): WGSLCode {
  const segments: WGSLSegment[] = strings.flatMap((string, idx) => {
    if (idx >= params.length) {
      return [string];
    }

    const param = params[idx]!;
    return param instanceof Array ? [string, ...param] : [string, param];
  });

  return new WGSLCode(segments);
}
