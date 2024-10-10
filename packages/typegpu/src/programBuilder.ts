import type { AnySchema } from 'typed-binary';
import { BindGroupResolver } from './bindGroupResolver';
import { typeForBuiltin } from './builtinDataTypes';
import {
  builtinSymbolToName,
  idForBuiltin,
  nameForBuiltin,
} from './builtinIdentifiers';
import type { TgpuBufferVertex } from './core/buffer/bufferUsage';
import type { SimpleTgpuData, TgpuArray } from './data';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import { code } from './tgpuCode';
import type { ExperimentalTgpuRoot } from './tgpuRoot';
import type {
  AnyTgpuData,
  BoundTgpuCode,
  TgpuCode,
  TgpuResolvable,
  Wgsl,
} from './types';

export type Program = {
  readonly bindGroupResolver: BindGroupResolver;
  readonly code: string;
};

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  nameRegistry?: NameRegistry;
};

export default class ProgramBuilder {
  constructor(
    private root: ExperimentalTgpuRoot,
    private rootNode: TgpuResolvable,
  ) {}

  build(options: BuildOptions): Program {
    const ctx = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
      jitTranspiler: this.root.jitTranspiler,
    });

    // Resolving code
    const codeString = ctx.resolve(this.rootNode);

    return {
      bindGroupResolver: new BindGroupResolver(
        this.root,
        ctx,
        options.shaderStage,
      ),
      code: codeString,
    };
  }
}

function getUsedBuiltinsNamed(
  rec: Record<symbol, string>,
): { name: string; builtinSymbol: symbol }[] {
  const res = Object.getOwnPropertySymbols(rec).map((builtinSymbol) => {
    const builtin = builtinSymbolToName.get(builtinSymbol);
    if (builtin === undefined) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    const name = rec[builtinSymbol] as string;
    return { name, builtinSymbol };
  });

  return res;
}

export class RenderProgramBuilder {
  constructor(
    private root: ExperimentalTgpuRoot,
    private vertexRoot: TgpuCode | BoundTgpuCode,
    private fragmentRoot: TgpuCode | BoundTgpuCode,
    private vertexOutputFormat: {
      [K in symbol]: string;
    } & {
      [K in string]: AnyTgpuData;
    },
  ) {}

  build(options: Omit<BuildOptions, 'shaderStage'>): {
    vertexProgram: Program;
    fragmentProgram: Program;
  } {
    const symbolOutputs = Object.getOwnPropertySymbols(
      this.vertexOutputFormat,
    ).map((symbol) => {
      const name = this.vertexOutputFormat[symbol];
      if (typeof name !== 'string') {
        throw new Error('Output names must be strings.');
      }
      return { symbol, name };
    });

    const vertexOutputBuiltinObjects = getUsedBuiltinsNamed(
      Object.fromEntries(
        symbolOutputs.map(({ symbol, name }) => [symbol, name]),
      ),
    );

    const vertexOutput = Object.keys(this.vertexOutputFormat).map(
      (name, index) => {
        const varInfo = this.vertexOutputFormat[name];
        if (!varInfo) {
          throw new Error('Output names must be strings.');
        }
        return { name, varInfo, index };
      },
    );

    const structFields = [
      ...vertexOutputBuiltinObjects.map((builtin) => {
        const outputName = this.vertexOutputFormat[builtin.builtinSymbol] ?? '';

        return code`
          @builtin(${nameForBuiltin(builtin.builtinSymbol)}) ${outputName}: ${typeForBuiltin(builtin.builtinSymbol)},
        `;
      }),
      ...vertexOutput.map(
        ({ name, varInfo, index }) =>
          code`
          @location(${index}) ${name}: ${varInfo},
        `,
      ),
    ];

    const vertexContext = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
      jitTranspiler: this.root.jitTranspiler,
    });
    vertexContext.resolve(this.vertexRoot);
    const vertexBuffers = Array.from(vertexContext.usedBindables).filter(
      (bindable): bindable is TgpuBufferVertex<AnyTgpuData> =>
        bindable.usage === 'vertex',
    );
    const entries = vertexBuffers.map((elem, idx) => {
      return {
        idx: idx,
        entry: {
          bindable: elem,
          underlyingType: elem.allocatable.dataType as
            | SimpleTgpuData<AnySchema>
            | TgpuArray<AnyTgpuData>,
        },
      };
    });

    const vertexUserArgs = entries.map(
      (entry) => code`
        @location(${entry.idx}) ${entry.entry.bindable} : ${
          'expressionCode' in entry.entry.underlyingType
            ? entry.entry.underlyingType.expressionCode
            : entry.entry.underlyingType.elementType
        },
    `,
    );
    const vertexBuiltins = Array.from(vertexContext.usedBuiltins);
    const vertexBuiltinsArgs = vertexBuiltins.map(
      (builtin) =>
        code`
      @builtin(${nameForBuiltin(builtin)}) ${idForBuiltin(builtin)}: ${typeForBuiltin(builtin)},
    `,
    );
    const vertexArgs = [...vertexBuiltinsArgs, ...vertexUserArgs];

    const vertexCode = code`
      struct VertexOutput {
        ${structFields}
      };

      @vertex
      fn main(${vertexArgs}) -> VertexOutput {
        ${this.vertexRoot}
        var output: VertexOutput;
        ${vertexOutputBuiltinObjects.map(
          (entry) =>
            code`
            output.${entry.name} = ${entry.name};
          `,
        )}
        ${vertexOutput.map(
          ({ name }) =>
            code`
            output.${name} = ${name};
          `,
        )}
        return output;
      }
    `;
    const fragmentContext = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
      jitTranspiler: this.root.jitTranspiler,
    });
    fragmentContext.resolve(this.fragmentRoot);

    const fragmentUsedBuiltins = Array.from(fragmentContext.usedBuiltins);
    const fragmentBuiltinArgs = fragmentUsedBuiltins.map((builtin) => {
      return code`
      @builtin(${nameForBuiltin(builtin)}) ${idForBuiltin(builtin)}: ${typeForBuiltin(builtin)},
    `;
    });

    const fragmentInputs = vertexOutput.map(
      ({ name, varInfo }, idx) => code`
      @location(${idx}) ${name}: ${varInfo},
    `,
    );
    const fragmentArgs = [...fragmentBuiltinArgs, ...fragmentInputs];
    const fragmentCode = code`
      @fragment
      fn main(${fragmentArgs}) -> @location(0) vec4f {
        ${this.fragmentRoot}
      }
    `;

    const vertexProgram = new ProgramBuilder(this.root, vertexCode).build({
      bindingGroup: options.bindingGroup,
      shaderStage: GPUShaderStage.VERTEX,
      nameRegistry: options.nameRegistry ?? new RandomNameRegistry(),
    });
    const fragmentProgram = new ProgramBuilder(this.root, fragmentCode).build({
      bindingGroup: options.bindingGroup + 1,
      shaderStage: GPUShaderStage.FRAGMENT,
      nameRegistry: options.nameRegistry ?? new RandomNameRegistry(),
    });

    vertexProgram.bindGroupResolver.setVertexBuffers(
      entries.map((entry) => {
        return {
          index: entry.idx,
          buffer: entry.entry.bindable,
        };
      }),
    );

    return { vertexProgram, fragmentProgram };
  }
}

export class ComputeProgramBuilder {
  constructor(
    private root: ExperimentalTgpuRoot,
    private computeRoot: Wgsl,
    private workgroupSize: readonly [
      number,
      (number | null)?,
      (number | null)?,
    ],
  ) {}

  build(options: Omit<BuildOptions, 'shaderStage'>): Program {
    const context = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
      jitTranspiler: this.root.jitTranspiler,
    });
    context.resolve(this.computeRoot);

    const usedBuiltins = Array.from(context.usedBuiltins);
    const builtinArgs = usedBuiltins.map(
      (builtin) => code`
      @builtin(${nameForBuiltin(builtin)}) ${idForBuiltin(builtin)}: ${typeForBuiltin(builtin)},
    `,
    );

    const workgroupSizeDeclaration = `@workgroup_size(${this.workgroupSize[0]}, ${this.workgroupSize[1] ?? 1}, ${this.workgroupSize[2] ?? 1})`;

    const shaderCode = code`
      @compute ${workgroupSizeDeclaration}
      fn main(${builtinArgs}) {
        ${this.computeRoot}
      }
    `;

    const program = new ProgramBuilder(this.root, shaderCode).build({
      bindingGroup: options.bindingGroup,
      shaderStage: GPUShaderStage.COMPUTE,
      nameRegistry: options.nameRegistry ?? new RandomNameRegistry(),
    });

    return program;
  }
}
