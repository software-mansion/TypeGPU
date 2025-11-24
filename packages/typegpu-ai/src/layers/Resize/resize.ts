import {
    type StorageFlag,
    TgpuBindGroup,
    type TgpuBuffer,
    type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { PipelineCache } from '../../pipelineCache.ts';
import { resizeCompute } from './compute.ts';
import { ioLayout, resizeParamsLayout, workgroupSize } from '../../schemas.ts';
import { identity } from '../activations/activationFunctions.ts';

export interface ResizeDimensions {
    channels: number;
    inH: number;
    inW: number;
    outH: number;
    outW: number;
}

export class LResize implements NNLayer {
    public readonly inSize: number;
    public readonly outSize: number;
    public readonly activation = 'identity';

    private readonly paramsBindGroup: TgpuBindGroup;

    constructor(
        private readonly root: TgpuRoot,
        private readonly pipelineCache: PipelineCache,
        dims: ResizeDimensions,
        scales: number[], // [batch_scale, channel_scale, height_scale, width_scale]
    ) {
        this.inSize = dims.channels * dims.inH * dims.inW;
        this.outSize = dims.channels * dims.outH * dims.outW;

        const dimsArray = [
            dims.channels,
            dims.inH,
            dims.inW,
            dims.outH,
            dims.outW,
        ];

        const dimsBuffer = this.root.createBuffer(
            d.arrayOf(d.u32, dimsArray.length),
            dimsArray,
        ).$usage('storage');

        const scalesBuffer = this.root.createBuffer(
            d.arrayOf(d.f32, scales.length),
            scales,
        ).$usage('storage');

        this.paramsBindGroup = this.root.createBindGroup(resizeParamsLayout, {
            dims: dimsBuffer,
            scales: scalesBuffer,
        });
    }

    async run(
        input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
        output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    ): Promise<void> {
        const ioBindGroup = this.root.createBindGroup(ioLayout, {
            input,
            output,
            inLength: this.root.createBuffer(d.u32, this.inSize).$usage('uniform'),
            outLength: this.root.createBuffer(d.u32, this.outSize).$usage('uniform'),
        });

        const pipeline = this.pipelineCache.get({
            kind: 'Resize',
            compute: resizeCompute,
        }, { kind: 'identity', fn: identity });

        pipeline
            .with(ioLayout, ioBindGroup)
            .with(resizeParamsLayout, this.paramsBindGroup)
            .dispatchWorkgroups(Math.ceil(this.outSize / workgroupSize));

        await this.root.device.queue.onSubmittedWorkDone();
    }
}
