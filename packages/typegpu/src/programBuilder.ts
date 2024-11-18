import type { AnySchema } from 'typed-binary';
import { BindGroupResolver } from './bindGroupResolver';
import type { TgpuBufferVertex } from './core/buffer/bufferUsage';
import type { ExperimentalTgpuRoot } from './core/root/rootTypes';
import type { SimpleTgpuData, TgpuArray } from './data';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import { code } from './tgpuCode';
import type { AnyTgpuData, TgpuResolvable, Wgsl } from './types';

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

export class RenderProgramBuilder {
  constructor(
    private root: ExperimentalTgpuRoot,
    private vertexRoot: Wgsl,
    private fragmentRoot: Wgsl,
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

    const vertexArgs = entries.map(
      (entry) => code`
        @location(${entry.idx}) ${entry.entry.bindable} : ${
          'expressionCode' in entry.entry.underlyingType
            ? entry.entry.underlyingType.expressionCode
            : entry.entry.underlyingType.elementType
        },
    `,
    );

    const vertexCode = code`
      struct VertexOutput {
        ${structFields}
      };

      @vertex
      fn main(${vertexArgs}) -> VertexOutput {
        ${this.vertexRoot}
        var output: VertexOutput;
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

    const fragmentArgs = vertexOutput.map(
      ({ name, varInfo }, idx) => code`
      @location(${idx}) ${name}: ${varInfo},
    `,
    );
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

    const workgroupSizeDeclaration = `@workgroup_size(${this.workgroupSize[0]}, ${this.workgroupSize[1] ?? 1}, ${this.workgroupSize[2] ?? 1})`;

    const shaderCode = code`
      @compute ${workgroupSizeDeclaration}
      fn main() {
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
