import { MissingBindGroupsError, MissingVertexBuffersError } from '../../errors.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { $internal } from '../../shared/symbols.ts';
import { logger } from '../../tgpuLogger.ts';
import {
  isBindGroup,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout.ts';
import { logDataFromGPU } from '../../tgsl/consoleLog/deserializers.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import { isBuffer } from '../../types.ts';
import type { IndexFlag, TgpuBuffer, VertexFlag } from '../buffer/buffer.ts';
import type { TgpuCommandEncoder } from '../commandEncoder/commandEncoder.ts';
import type { ComputePassInternals } from '../commandEncoder/computePass.ts';
import type { RenderPassInternals } from '../commandEncoder/renderPass.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import type { TgpuComputePipeline } from './computePipeline.ts';
import type { TgpuRenderPipeline } from './renderPipeline.ts';
import { queueTimestampResolve, type TimestampWritesPriors } from './timeable.ts';

export interface VertexBufferEntry {
  buffer: (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer;
  offset?: number | undefined;
  size?: number | undefined;
}

export interface IndexBufferEntry {
  buffer: (TgpuBuffer<BaseData> & IndexFlag) | GPUBuffer;
  indexFormat: GPUIndexFormat;
  offsetBytes?: number | undefined;
  sizeBytes?: number | undefined;
}

export class RenderDrawState {
  readonly bindGroups = new Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>();
  readonly vertexBuffers = new Map<TgpuVertexLayout, VertexBufferEntry>();
  currentPipeline: TgpuRenderPipeline | undefined;
  indexBuffer: IndexBufferEntry | undefined;
  stencilReference: GPUStencilValue | undefined;
  /** What the raw pass holds, starting at the WebGPU default; survives executeBundles */
  appliedStencilReference: GPUStencilValue = 0;
  version = 0;
  /** Raw access via `root.unwrap(pass)` can mutate state invisibly, disabling deduplication */
  rawAccessed = false;
}

export class ComputeDrawState {
  readonly bindGroups = new Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>();
  currentPipeline: TgpuComputePipeline | undefined;
  version = 0;
  rawAccessed = false;
}

export function recordBindGroup(
  state: RenderDrawState | ComputeDrawState,
  first: TgpuBindGroup | TgpuBindGroupLayout,
  bindGroup: TgpuBindGroup | GPUBindGroup | undefined,
): void {
  if (isBindGroup(first)) {
    state.bindGroups.set(first.layout, first);
  } else {
    state.bindGroups.set(first, bindGroup as TgpuBindGroup | GPUBindGroup);
  }
  state.version++;
}

/** Writes the pipeline and its bound resources into pass state; later set* calls overwrite them */
export function stampRenderPipeline(state: RenderDrawState, pipeline: TgpuRenderPipeline): void {
  const { priors } = pipeline[$internal];
  state.currentPipeline = pipeline;

  if (priors.bindGroupLayoutMap) {
    for (const [layout, group] of priors.bindGroupLayoutMap) {
      state.bindGroups.set(layout, group);
    }
  }
  if (priors.vertexLayoutMap) {
    for (const [layout, buffer] of priors.vertexLayoutMap) {
      state.vertexBuffers.set(layout, { buffer, offset: undefined, size: undefined });
    }
  }
  if (priors.indexBuffer) {
    state.indexBuffer = priors.indexBuffer;
  }
  if (priors.stencilReference !== undefined) {
    state.stencilReference = priors.stencilReference;
  }
  state.version++;
}

/** The compute counterpart of {@link stampRenderPipeline} */
export function stampComputePipeline(state: ComputeDrawState, pipeline: TgpuComputePipeline): void {
  const { priors } = pipeline[$internal];
  state.currentPipeline = pipeline;

  if (priors.bindGroupLayoutMap) {
    for (const [layout, group] of priors.bindGroupLayoutMap) {
      state.bindGroups.set(layout, group);
    }
  }
  state.version++;
}

function applyIndexBuffer(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  root: ExperimentalTgpuRoot,
  entry: IndexBufferEntry,
): void {
  const { buffer, indexFormat, offsetBytes, sizeBytes } = entry;
  if (isBuffer(buffer)) {
    encoder.setIndexBuffer(root.unwrap(buffer), indexFormat, offsetBytes, sizeBytes);
  } else {
    encoder.setIndexBuffer(buffer, indexFormat, offsetBytes, sizeBytes);
  }
}

function applyBindGroups(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder | GPUComputePassEncoder,
  root: ExperimentalTgpuRoot,
  usedBindGroupLayouts: TgpuBindGroupLayout[],
  catchall: [number, TgpuBindGroup] | undefined,
  resolveBindGroup: (layout: TgpuBindGroupLayout) => TgpuBindGroup | GPUBindGroup | undefined,
): void {
  const missingBindGroups = new Set(usedBindGroupLayouts);

  usedBindGroupLayouts.forEach((layout, idx) => {
    if (catchall && idx === catchall[0]) {
      encoder.setBindGroup(idx, root.unwrap(catchall[1]));
      missingBindGroups.delete(layout);
    } else {
      const bindGroup = resolveBindGroup(layout);
      if (bindGroup !== undefined) {
        missingBindGroups.delete(layout);
        if (isBindGroup(bindGroup)) {
          encoder.setBindGroup(idx, root.unwrap(bindGroup));
        } else {
          encoder.setBindGroup(idx, bindGroup);
        }
      }
    }
  });

  if (missingBindGroups.size > 0) {
    throw new MissingBindGroupsError(missingBindGroups);
  }
}

function applyVertexBuffers(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  root: ExperimentalTgpuRoot,
  usedVertexLayouts: TgpuVertexLayout[],
  resolveVertexBuffer: (layout: TgpuVertexLayout) => VertexBufferEntry | undefined,
): void {
  const missingVertexLayouts = new Set<TgpuVertexLayout>();

  usedVertexLayouts.forEach((vertexLayout, idx) => {
    const entry = resolveVertexBuffer(vertexLayout);
    if (!entry || !entry.buffer) {
      missingVertexLayouts.add(vertexLayout);
    } else if (isBuffer(entry.buffer)) {
      encoder.setVertexBuffer(idx, root.unwrap(entry.buffer), entry.offset, entry.size);
    } else {
      encoder.setVertexBuffer(idx, entry.buffer, entry.offset, entry.size);
    }
  });

  if (missingVertexLayouts.size > 0) {
    throw new MissingVertexBuffersError(missingVertexLayouts);
  }
}

function applyRenderPipelineState(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  root: ExperimentalTgpuRoot,
  pipeline: TgpuRenderPipeline,
  passState: RenderDrawState,
): void {
  const memo = pipeline[$internal].core.unwrap();
  encoder.setPipeline(memo.pipeline);

  applyBindGroups(encoder, root, memo.usedBindGroupLayouts, memo.catchall, (layout) =>
    passState.bindGroups.get(layout),
  );

  applyVertexBuffers(encoder, root, memo.usedVertexLayouts, (vertexLayout) =>
    passState.vertexBuffers.get(vertexLayout),
  );

  if (passState.indexBuffer !== undefined) {
    applyIndexBuffer(encoder, root, passState.indexBuffer);
  }

  if (
    typeof (encoder as GPURenderPassEncoder).setStencilReference === 'function' &&
    passState.stencilReference !== undefined
  ) {
    if (passState.rawAccessed || passState.stencilReference !== passState.appliedStencilReference) {
      (encoder as GPURenderPassEncoder).setStencilReference(passState.stencilReference);
      passState.appliedStencilReference = passState.stencilReference;
    }
  }
}

function applyComputePipelineState(
  encoder: GPUComputePassEncoder,
  root: ExperimentalTgpuRoot,
  pipeline: TgpuComputePipeline,
  passState: ComputeDrawState,
): void {
  const memo = pipeline[$internal].core.unwrap();
  encoder.setPipeline(memo.pipeline);

  applyBindGroups(encoder, root, memo.usedBindGroupLayouts, memo.catchall, (layout) =>
    passState.bindGroups.get(layout),
  );
}

export function requireIndexBuffer(indexBuffer: IndexBufferEntry | undefined): void {
  if (!indexBuffer) {
    throw new Error(
      'No index buffer is set. Call pipeline.withIndexBuffer or pass.setIndexBuffer before drawing indexed geometry.',
    );
  }
}

function warnAboutUnreachableSubmission(core: object, what: string): void {
  logger.warnOnce(
    'suspicious',
    core,
    what,
    `${what} is ignored when recording into a raw GPUCommandEncoder, since there is no submission to report after. Use root['~unstable'].createCommandEncoder() instead.`,
  );
}

/** Returns false when there is no encoder to defer the read to, meaning the output is lost */
function queueLogDrain(
  encoder: TgpuCommandEncoder | undefined,
  logResources: LogResources,
): boolean {
  if (!encoder || encoder[$internal].adopted) {
    return false;
  }

  encoder[$internal].afterSubmit.set(logResources, () => logDataFromGPU(logResources));
  return true;
}

export function finalizeOwnEncoder(
  encoder: TgpuCommandEncoder,
  core: object,
  logResources: LogResources | undefined,
  priors: TimestampWritesPriors & { readonly encoder?: TgpuCommandEncoder | undefined },
): void {
  if (logResources && !queueLogDrain(encoder, logResources)) {
    warnAboutUnreachableSubmission(core, 'Shader console.log output');
  }

  if (priors.performanceCallback && !queueTimestampResolve(encoder, priors)) {
    warnAboutUnreachableSubmission(core, 'The performance callback');
  }

  if (priors.encoder === undefined) {
    encoder.submit();
  }
}

const PassKindWording = {
  render: {
    into: 'drawing into a render pass',
    intoRaw: 'drawing into a raw render pass',
    begin: 'beginRenderPass',
  },
  compute: {
    into: 'dispatching into a compute pass',
    intoRaw: 'dispatching into a raw compute pass',
    begin: 'beginComputePass',
  },
} as const;

function reportIgnoredPriors(
  core: object,
  owner: TgpuCommandEncoder | undefined,
  hasTimestampWrites: boolean,
  logResources: LogResources | undefined,
  passKind: 'render' | 'compute',
  hasAttachments = false,
): void {
  const wording = PassKindWording[passKind];

  if (hasAttachments) {
    logger.warnOnce(
      'suspicious',
      core,
      'attachments',
      `Pipeline-level attachments are ignored when ${wording.into}. Pass \`colorAttachments\` and \`depthStencilAttachment\` to encoder.${wording.begin} instead.`,
    );
  }

  if (hasTimestampWrites) {
    logger.warnOnce(
      'suspicious',
      core,
      'timestampWrites',
      `Pipeline-level timestamp writes are ignored when ${wording.into}. Pass \`timestampWrites\` to encoder.${wording.begin} instead.`,
    );
  }

  if (logResources && !queueLogDrain(owner, logResources)) {
    logger.warnOnce(
      'suspicious',
      core,
      'logs',
      `Shader console.log output is ignored when ${wording.intoRaw} encoder, since there is no submission to read it back after.`,
    );
  }
}

export function emitRenderDraw(
  root: ExperimentalTgpuRoot,
  passInternals: RenderPassInternals,
  pipeline: TgpuRenderPipeline,
  usesIndexBuffer: boolean,
  emit: (rawPass: GPURenderPassEncoder | GPURenderBundleEncoder) => void,
  ownsPass = false,
): void {
  const { state, rawPass } = passInternals;
  const { core, priors } = pipeline[$internal];

  if (state.currentPipeline !== pipeline) {
    stampRenderPipeline(state, pipeline);
  }

  if (usesIndexBuffer) {
    requireIndexBuffer(state.indexBuffer);
  }

  const memo = core.unwrap();
  if (!ownsPass) {
    reportIgnoredPriors(
      core,
      passInternals.owner,
      !!priors.timestampWrites,
      memo.logResources,
      'render',
      !!priors.colorAttachment || !!priors.depthStencilAttachment,
    );
  }

  if (state.rawAccessed || passInternals.appliedVersion !== state.version) {
    applyRenderPipelineState(rawPass, root, pipeline, state);
    passInternals.appliedVersion = state.version;
  }

  emit(rawPass);
}

export function emitComputeDispatch(
  root: ExperimentalTgpuRoot,
  passInternals: ComputePassInternals,
  pipeline: TgpuComputePipeline,
  emit: (rawPass: GPUComputePassEncoder) => void,
  ownsPass = false,
): void {
  const { state, rawPass } = passInternals;
  const { core, priors } = pipeline[$internal];

  if (state.currentPipeline !== pipeline) {
    stampComputePipeline(state, pipeline);
  }

  const memo = core.unwrap();
  if (!ownsPass) {
    reportIgnoredPriors(
      core,
      passInternals.owner,
      !!priors.timestampWrites,
      memo.logResources,
      'compute',
    );
  }

  if (state.rawAccessed || passInternals.appliedVersion !== state.version) {
    applyComputePipelineState(rawPass, root, pipeline, state);
    passInternals.appliedVersion = state.version;
  }

  emit(rawPass);
}
