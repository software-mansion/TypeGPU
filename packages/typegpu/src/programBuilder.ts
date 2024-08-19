import type { AnySchema } from 'typed-binary';
import type { SimpleWgslData } from './data';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import { deriveVertexFormat } from './typegpuRuntime';
import type { TypeGpuRuntime } from './typegpuRuntime';
import type {
  AnyWgslData,
  BufferUsage,
  WgslBindable,
  WgslResolvable,
} from './types';
import { getUsedBuiltinsNamed } from './wgslBuiltin';
import { type BoundWgslCode, type WgslCode, code } from './wgslCode';
import { type WgslSampler, isSampler } from './wgslSampler';
import {
  type WgslAnyTextureView,
  type WgslTextureExternal,
  isExternalTexture,
  isTextureView,
} from './wgslTexture';

export type Program = {
  readonly bindGroupResolver: BindGroupResolver;
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
  mutable: 'storage',
  readonly: 'read-only-storage',
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

    return {
      bindGroupResolver: new BindGroupResolver(
        this.runtime,
        ctx,
        options.shaderStage,
      ),
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
    const entries = vertexBuffers.map((elem, idx) => {
      return {
        idx: idx,
        entry: {
          bindable: elem,
          underlyingType: elem.allocatable
            .dataType as SimpleWgslData<AnySchema>,
        },
      };
    });

    const vertexUserArgs = entries.map(
      (entry) => code`
        @location(${entry.idx}) ${entry.entry.bindable} : ${entry.entry.underlyingType.getUnderlyingTypeString()},
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

export class BindGroupResolver {
  private samplers: WgslSampler[] = [];
  private textureViews: WgslAnyTextureView[] = [];
  private externalTextures: WgslTextureExternal[] = [];
  private buffers: WgslBindable<AnyWgslData, BufferUsage>[] = [];
  private vertexBuffers: Map<
    WgslBindable<AnyWgslData, 'vertex'>,
    number
  > | null = null;

  private layout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;

  constructor(
    private runtime: TypeGpuRuntime,
    private context: ResolutionCtxImpl,
    public readonly shaderStage: number,
  ) {
    const renderResources = Array.from(context.usedRenderResources);
    for (const resource of renderResources) {
      if (isSampler(resource)) {
        this.samplers.push(resource);
      } else if (isTextureView(resource)) {
        this.textureViews.push(resource);
      } else if (isExternalTexture(resource)) {
        this.externalTextures.push(resource);
      } else {
        throw new Error(`Invalid resource type: ${resource}`);
      }
    }
    this.buffers = Array.from(context.usedBindables);
  }

  setVertexBuffers(
    vertexBuffers: {
      index: number;
      buffer: WgslBindable<AnyWgslData, 'vertex'>;
    }[],
  ) {
    if (this.shaderStage !== GPUShaderStage.VERTEX) {
      throw new Error('Vertex buffers can only be set for vertex shader');
    }
    this.vertexBuffers = new Map(
      vertexBuffers.map(({ index, buffer }) => [buffer, index]),
    );
  }

  getBindGroupLayout() {
    if (this.layout) return this.layout;
    const entries: GPUBindGroupLayoutEntry[] = [];
    for (const textureView of this.textureViews) {
      if (textureView.access === undefined) {
        entries.push({
          binding: this.context.getIndexFor(textureView),
          visibility: this.shaderStage,
          texture: {},
        });
      } else {
        entries.push({
          binding: this.context.getIndexFor(textureView),
          visibility: this.shaderStage,
          storageTexture: { format: textureView.texture.descriptor.format },
        });
      }
    }
    for (const external of this.externalTextures) {
      entries.push({
        binding: this.context.getIndexFor(external),
        visibility: this.shaderStage,
        externalTexture: {},
      });
    }
    for (const sampler of this.samplers) {
      entries.push({
        binding: this.context.getIndexFor(sampler),
        visibility: this.shaderStage,
        sampler: {},
      });
    }
    for (const buffer of this.buffers) {
      if (buffer.usage === 'vertex') continue;
      entries.push({
        binding: this.context.getIndexFor(buffer),
        visibility: this.shaderStage,
        buffer: {
          type: usageToBindingTypeMap[buffer.usage],
        },
      });
    }
    const layout = this.runtime.device.createBindGroupLayout({
      entries,
    });
    this.layout = layout;
    return layout;
  }

  getBindGroup() {
    if (this.bindGroup) return this.bindGroup;
    const entries: GPUBindGroupEntry[] = [];
    for (const textureView of this.textureViews) {
      entries.push({
        binding: this.context.getIndexFor(textureView),
        resource: this.runtime.viewFor(textureView),
      });
    }
    for (const external of this.externalTextures) {
      entries.push({
        binding: this.context.getIndexFor(external),
        resource: this.runtime.externalTextureFor(external),
      });
    }
    for (const sampler of this.samplers) {
      entries.push({
        binding: this.context.getIndexFor(sampler),
        resource: this.runtime.samplerFor(sampler),
      });
    }
    for (const buffer of this.buffers) {
      if (buffer.usage === 'vertex') continue;
      entries.push({
        binding: this.context.getIndexFor(buffer),
        resource: {
          buffer: this.runtime.bufferFor(buffer.allocatable),
        },
      });
    }
    const bindGroup = this.runtime.device.createBindGroup({
      layout: this.getBindGroupLayout(),
      entries,
    });

    if (this.externalTextures.length === 0) {
      this.bindGroup = bindGroup;
    }
    return bindGroup;
  }

  getBindings() {
    return {
      bindGroupLayout: this.getBindGroupLayout(),
      bindGroup: this.getBindGroup(),
    };
  }

  getVertexBufferDescriptors() {
    if (this.vertexBuffers === null) {
      throw new Error('Vertex buffers not set');
    }

    const vertexBufferDescriptors: GPUVertexBufferLayout[] = [];
    for (const [buffer, idx] of this.vertexBuffers.entries()) {
      if (!buffer.allocatable.vertexLayout) {
        throw new Error(
          `Buffer ${buffer.allocatable} does not have a vertex layout`,
        );
      }
      vertexBufferDescriptors.push({
        ...buffer.allocatable.vertexLayout,
        attributes: [
          {
            shaderLocation: idx,
            offset: 0,
            format: deriveVertexFormat(
              buffer.allocatable.dataType as SimpleWgslData<AnyWgslData>,
            ),
          },
        ],
      });
    }

    return vertexBufferDescriptors;
  }

  getVertexBuffers() {
    if (this.vertexBuffers === null) {
      throw new Error('Vertex buffers not set');
    }
    return this.vertexBuffers.entries();
  }

  getVertexBufferIndex(buffer: WgslBindable<AnyWgslData, 'vertex'>) {
    const index = this.vertexBuffers?.get(buffer);
    if (this.vertexBuffers === null || !index) {
      throw new Error('Vertex buffers not set');
    }
    return this.vertexBuffers.get(buffer);
  }
}
