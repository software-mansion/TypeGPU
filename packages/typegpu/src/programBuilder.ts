import type { AnySchema } from 'typed-binary';
import type { SimpleWgslData } from './data';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { TypeGpuRuntime } from './typegpuRuntime';
import type {
  AnyWgslData,
  AnyWgslPrimitive,
  AnyWgslTexelFormat,
  BufferUsage,
  TextureUsage,
  WgslBindable,
  WgslResolvable,
} from './types';
import { isSamplerType } from './types';
import { getUsedBuiltinsNamed } from './wgslBuiltin';
import { type BoundWgslCode, type WgslCode, code } from './wgslCode';
import type { WgslSampler } from './wgslSampler';
import {
  type WgslAnyTextureView,
  type WgslTextureExternal,
  type WgslTextureView,
  isExternalTexture,
} from './wgslTexture';

export type Program = {
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly bindGroup: GPUBindGroup;
  readonly code: string;
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
    private runtime: TypeGpuRuntime,
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
    for (const texture of usedTextures) {
      const textureView = texture as unknown as WgslAnyTextureView;
      if (textureView.access === undefined) {
        allEntries.push({
          binding: ctx.getIndexFor(texture),
          visibility: options.shaderStage,
          texture: {},
        });
      } else {
        allEntries.push({
          binding: ctx.getIndexFor(texture),
          visibility: options.shaderStage,
          storageTexture: { format: textureView.texture.descriptor.format },
        });
      }
    }
    for (const external of usedExternalTextures) {
      allEntries.push({
        binding: ctx.getIndexFor(external),
        visibility: options.shaderStage,
        externalTexture: {},
      });
    }
    for (const sampler of usedSamplers) {
      allEntries.push({
        binding: ctx.getIndexFor(sampler),
        visibility: options.shaderStage,
        sampler: {},
      });
    }
    for (const bindable of usedBindables) {
      if (bindable.usage === 'vertex') continue;
      allEntries.push({
        binding: ctx.getIndexFor(bindable),
        visibility: options.shaderStage,
        buffer: {
          type: usageToBindingTypeMap[bindable.usage],
        },
      });
    }

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: allEntries,
    });

    const allBindGroupEntries: GPUBindGroupEntry[] = [];
    for (const texture of usedTextures) {
      allBindGroupEntries.push({
        binding: ctx.getIndexFor(texture),
        resource: this.runtime.viewFor(
          texture as WgslTextureView<
            AnyWgslPrimitive | AnyWgslTexelFormat,
            TextureUsage
          >,
        ),
      });
    }
    for (const externalTexture of usedExternalTextures) {
      allBindGroupEntries.push({
        binding: ctx.getIndexFor(externalTexture),
        resource: this.runtime.externalTextureFor(
          externalTexture as WgslTextureExternal,
        ),
      });
    }
    for (const sampler of usedSamplers) {
      allBindGroupEntries.push({
        binding: ctx.getIndexFor(sampler),
        resource: this.runtime.samplerFor(sampler as WgslSampler),
      });
    }
    for (const bindable of usedBindables) {
      if (bindable.usage === 'vertex') continue;
      allBindGroupEntries.push({
        binding: ctx.getIndexFor(bindable),
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
    private runtime: TypeGpuRuntime,
    private vertexRoot: WgslCode | BoundWgslCode,
    private fragmentRoot: WgslCode | BoundWgslCode,
    private vertexOutputFormat: {
      [K in symbol]: string;
    } & {
      [K in string]: AnyWgslData;
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
          @location(${index}) ${name}: ${varInfo},
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
    const vertexBuiltins = Array.from(vertexContext.usedBuiltins);
    const vertexBuiltinsArgs = vertexBuiltins.map(
      (builtin) => code`
      @builtin(${builtin.name}) ${builtin.identifier}: ${builtin.type},
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

    const fragmentUsedBuiltins = Array.from(fragmentContext.usedBuiltins);
    const fragmentBuiltinArgs = fragmentUsedBuiltins.map(
      (builtin) => code`
      @builtin(${builtin.name}) ${builtin.identifier}: ${builtin.type},
    `,
    );

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
    private runtime: TypeGpuRuntime,
    private computeRoot: WgslCode | BoundWgslCode,
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
    });
    context.resolve(this.computeRoot);

    const usedBuiltins = Array.from(context.usedBuiltins);
    const builtinArgs = usedBuiltins.map(
      (builtin) => code`
      @builtin(${builtin.name}) ${builtin.identifier}: ${builtin.type},
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
