import type { AnySchema } from 'typed-binary';
import type { SimpleWgslData } from './data';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type {
  AnyWgslData,
  AnyWgslPrimitive,
  BufferUsage,
  WgslBindable,
  WgslResolvable,
} from './types';
import { isSamplerType } from './types';
import { getBuiltinInfo, getUsedBuiltinsNamed } from './wgslBuiltin';
import { type WgslCode, code } from './wgslCode';
import type { WgslSampler } from './wgslSampler';
import {
  type WgslTextureExternal,
  type WgslTextureView,
  type WgslTexture,
  isExternalTexture,
} from './wgslTexture';
import type { WigsillRuntime } from './wigsillRuntime';

export type Program = {
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  code: string;
};

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  nameRegistry?: NameRegistry;
};

const usageToBindingTypeMap: Record<
  Exclude<BufferUsage, 'vertex'>,
  GPUBufferBindingType
> = {
  uniform: 'uniform',
  mutable_storage: 'storage',
  readonly_storage: 'read-only-storage',
};

export default class ProgramBuilder {
  constructor(
    private runtime: WigsillRuntime,
    private root: WgslResolvable,
  ) {}

  build(options: BuildOptions): Program {
    const ctx = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
    });

    // Resolving code
    const codeString = ctx.resolve(this.root);
    const usedBindables = Array.from(ctx.usedBindables);
    const usedRenderResources = Array.from(ctx.usedRenderResources);
    const usedSamplers = usedRenderResources.filter((resource) =>
      isSamplerType(resource.type),
    );
    const usedTextures = usedRenderResources.filter(
      (resource) =>
        !isSamplerType(resource.type) && !isExternalTexture(resource),
    );
    const usedExternalTextures = usedRenderResources.filter((resource) =>
      isExternalTexture(resource),
    );
    const allEntries: GPUBindGroupLayoutEntry[] = [];
    let idx = 0;
    for (const _ of usedTextures) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        texture: {},
      });
    }
    for (const _ of usedExternalTextures) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        externalTexture: {},
      });
    }
    for (const _ of usedSamplers) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        sampler: {},
      });
    }
    for (const bindable of usedBindables) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        buffer: {
          type:
            bindable.usage === 'vertex'
              ? usageToBindingTypeMap[bindable.vertexUsage]
              : usageToBindingTypeMap[bindable.usage],
        },
      });
    }

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: allEntries,
    });

    const allBindGroupEntries: GPUBindGroupEntry[] = [];
    idx = 0;
    for (const texture of usedTextures) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: this.runtime.viewFor(texture as WgslTextureView),
      });
    }
    for (const externalTexture of usedExternalTextures) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: this.runtime.externalTextureFor(
          externalTexture as WgslTextureExternal,
        ),
      });
    }
    for (const sampler of usedSamplers) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: this.runtime.samplerFor(sampler as WgslSampler),
      });
    }
    for (const bindable of usedBindables) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: {
          buffer: this.runtime.bufferFor(bindable.allocatable),
        },
      });
    }

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: allBindGroupEntries,
    });

    return {
      bindGroupLayout,
      bindGroup,
      code: codeString,
    };
  }
}

export class RenderProgramBuilder {
  constructor(
    private runtime: WigsillRuntime,
    private vertexRoot: WgslCode,
    private fragmentRoot: WgslCode,
    private vertexOutputFormat: {
      [K in symbol]: string;
    } & {
      [K in string]: [AnyWgslData, string];
    },
  ) {}

  build(
    options: Omit<BuildOptions, 'shaderStage'>,
  ): [Program, Program, WgslBindable<AnyWgslData, 'vertex'>[]] {
    const symbolOutputs = Object.getOwnPropertySymbols(
      this.vertexOutputFormat,
    ).map((symbol) => {
      const name = this.vertexOutputFormat[symbol];
      if (typeof name !== 'string') {
        throw new Error('Output names must be strings.');
      }
      return { symbol, name };
    });
    const symbolRecord: Record<symbol, string> = Object.fromEntries(
      symbolOutputs.map(({ symbol, name }) => [symbol, name]),
    );

    const vertexOutputBuiltins = getUsedBuiltinsNamed(symbolRecord);
    const outputVars = Object.keys(this.vertexOutputFormat);
    const vertexOutput = outputVars.map((name, index) => {
      const varInfo = this.vertexOutputFormat[name];
      if (!varInfo) {
        throw new Error('Output names must be strings.');
      }
      return { name, varInfo, index };
    });

    const structFields = [
      ...vertexOutputBuiltins.map(
        (entry) =>
          code`
          @builtin(${entry.builtin.name}) ${entry.name}: ${entry.builtin.type},
        `,
      ),
      ...vertexOutput.map(
        ({ name, varInfo, index }) =>
          code`
          @location(${index}) ${name}: ${varInfo[0]},
        `,
      ),
    ];

    const vertexContext = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
    });
    vertexContext.resolve(this.vertexRoot);
    const vertexBuffers = Array.from(vertexContext.usedBindables).filter(
      (bindable) => bindable.usage === 'vertex',
    ) as WgslBindable<AnyWgslData, 'vertex'>[];
    const entries = vertexBuffers.map((elem) => {
      return {
        bindable: elem,
        underlyingType: elem.allocatable.dataType as SimpleWgslData<AnySchema>,
      };
    });

    const vertexUserArgs = entries.map(
      (entry, idx) => code`
        @location(${idx}) ${entry.bindable} : ${entry.underlyingType.getUnderlyingTypeString()},
    `,
    );
    const usedVertexBuiltins = this.vertexRoot.getUsedBuiltins();
    const vertexBuiltins = usedVertexBuiltins.map((builtin) =>
      getBuiltinInfo(builtin),
    );
    const vertexBuiltinsArgs = vertexBuiltins.map(
      (builtin) => code`
      @builtin(${builtin.name}) ${builtin.name}: ${builtin.type},
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
        ${vertexOutputBuiltins.map(
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
    });
    fragmentContext.resolve(this.fragmentRoot);

    const fragmentUsedBuiltins = this.fragmentRoot
      .getUsedBuiltins()
      .map((builtin) => getBuiltinInfo(builtin));
    const fragmentBuiltinArgs = fragmentUsedBuiltins.map(
      (builtin) => code`
      @builtin(${builtin.name}) ${builtin.name}: ${builtin.type},
    `,
    );

    const fragmentInputs = vertexOutput.map(
      ({ name, varInfo }, idx) => code`
      @location(${idx}) ${name}: ${varInfo[0]},
    `,
    );
    const fragmentArgs = [...fragmentBuiltinArgs, ...fragmentInputs];
    const fragmentCode = code`
      @fragment
      fn main(${fragmentArgs}) -> @location(0) vec4f {
        ${this.fragmentRoot}
      }
    `;

    const vertexProgram = new ProgramBuilder(this.runtime, vertexCode).build({
      bindingGroup: options.bindingGroup,
      shaderStage: GPUShaderStage.VERTEX,
      nameRegistry: options.nameRegistry ?? new RandomNameRegistry(),
    });
    const fragmentProgram = new ProgramBuilder(
      this.runtime,
      fragmentCode,
    ).build({
      bindingGroup: options.bindingGroup + 1,
      shaderStage: GPUShaderStage.FRAGMENT,
      nameRegistry: options.nameRegistry ?? new RandomNameRegistry(),
    });

    return [vertexProgram, fragmentProgram, vertexBuffers];
  }
}

export class ComputeProgramBuilder {
  constructor(
    private runtime: WigsillRuntime,
    private computeRoot: WgslCode,
    private workgroupSize: [number, (number | null)?, (number | null)?],
  ) {}

  build(options: Omit<BuildOptions, 'shaderStage'>): Program {
    const context = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
    });
    context.resolve(this.computeRoot);

    const usedBuiltins = this.computeRoot
      .getUsedBuiltins()
      .map((builtin) => getBuiltinInfo(builtin));
    const builtinArgs = usedBuiltins.map(
      (builtin) => code`
      @builtin(${builtin.name}) ${builtin.name}: ${builtin.type},
    `,
    );

    const workgroupSizeDeclaration = `@workgroup_size(${this.workgroupSize[0]}, ${this.workgroupSize[1] ?? 1}, ${this.workgroupSize[2] ?? 1})`;

    const shaderCode = code`
      @compute ${workgroupSizeDeclaration}
      fn main(${builtinArgs}) {
        ${this.computeRoot}
      }
    `;

    const program = new ProgramBuilder(this.runtime, shaderCode).build({
      bindingGroup: options.bindingGroup,
      shaderStage: GPUShaderStage.COMPUTE,
      nameRegistry: options.nameRegistry ?? new RandomNameRegistry(),
    });

    return program;
  }
}
