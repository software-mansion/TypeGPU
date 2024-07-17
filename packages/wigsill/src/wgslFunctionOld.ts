import type StructDataType from './std140/struct';
import type { ResolutionCtx, WGSLItem, WGSLSegment } from './types';
import { type WGSLCode, code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

export class WGSLFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();

  constructor(private readonly body: WGSLSegment) {}

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`fn ${this.identifier}${this.body}`);

    return ctx.resolve(this.identifier);
  }
}

export class WGSLVertexFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();
  private _args: WGSLSegment[];
  private _code: WGSLCode;
  // biome-ignore lint/suspicious/noExplicitAny:
  private _output: StructDataType<any>;

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  constructor({
    args,
    code,
    output,
  }: {
    args: WGSLSegment[];
    code: WGSLCode;
    // biome-ignore lint/suspicious/noExplicitAny:
    output: StructDataType<any>;
  }) {
    this._args = args;
    this._code = code;
    this._output = output;
  }

  resolve(ctx: ResolutionCtx): string {
    return code`@vertex fn ${this.identifier}(${this._args}) -> ${this._output} {
      ${this._code}
    }`.resolve(ctx);
  }
}

export class WGSLFragmentFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();
  private _args: WGSLSegment[];
  private _code: WGSLCode;
  private _output: WGSLSegment;

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  constructor({
    args,
    code,
    output,
  }: {
    args: WGSLSegment[];
    code: WGSLCode;
    output: WGSLSegment;
  }) {
    this._args = args;
    this._code = code;
    this._output = output;
  }

  resolve(ctx: ResolutionCtx): string {
    return code`@fragment fn ${this.identifier}(${this._args}) -> ${this._output} {
      ${this._code}
    }`.resolve(ctx);
  }
}

export class WGSLComputeFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();
  private _args: WGSLSegment[];
  private _code: WGSLCode;
  private _workgroupSize: [number, number?, number?];

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  constructor({
    args,
    code,
    workgroupSize,
  }: {
    args: WGSLSegment[];
    code: WGSLCode;
    workgroupSize: [number, number?, number?];
  }) {
    this._args = args;
    this._code = code;
    this._workgroupSize = workgroupSize;
  }

  resolve(ctx: ResolutionCtx): string {
    return code`@compute @workgroup_size(${this._workgroupSize.join(', ')}) fn ${this.identifier}(${this._args}) {
      ${this._code}
    }`.resolve(ctx);
  }
}

export function fn(debugLabel?: string) {
  return (
    strings: TemplateStringsArray,
    ...params: WGSLSegment[]
  ): WGSLFunction => {
    const func = new WGSLFunction(code(strings, ...params));
    if (debugLabel) {
      func.alias(debugLabel);
    }
    return func;
  };
}

export function vertexFn({
  args,
  code,
  output,
}: {
  args: WGSLSegment[];
  code: WGSLCode;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  output: StructDataType<any>;
}) {
  return new WGSLVertexFunction({ args, code, output });
}

export function fragmentFn({
  args,
  code,
  output,
}: {
  args: WGSLSegment[];
  code: WGSLCode;
  output: WGSLSegment;
}) {
  return new WGSLFragmentFunction({ args, code, output });
}

export function computeFn({
  args,
  code,
  workgroupSize,
}: {
  args: WGSLSegment[];
  code: WGSLCode;
  workgroupSize: [number, number?, number?];
}) {
  return new WGSLComputeFunction({ args, code, workgroupSize });
}
