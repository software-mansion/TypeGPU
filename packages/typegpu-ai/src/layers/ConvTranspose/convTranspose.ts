import {
    type StorageFlag,
    TgpuBindGroup,
    type TgpuBuffer,
    type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { PipelineCache } from '../../pipelineCache.ts';
import { convTransposeCompute } from './compute.ts';
import { convWeightsLayout, ioLayout, workgroupSize } from '../../schemas.ts';
import type { Activation } from '../../pipelineCache.ts';
import { identity, relu } from '../activations/activationFunctions.ts';

export interface ConvTransposeDimensions {
    inputChannels: number;
    inputHeight: number;
    inputWidth: number;
    kernelHeight: number;
    kernelWidth: number;
    strideH: number;
    strideW: number;
    padH: number;
    padW: number;
    outputChannels: number;
    outputHeight: number;
    outputWidth: number;
}

export class LConvTranspose implements NNLayer {
    public readonly inSize: number;
    public readonly outSize: number;
    public readonly activation: string | undefined;

    private readonly paramsBindGroup: TgpuBindGroup;

    constructor(
        private readonly root: TgpuRoot,
        private readonly pipelineCache: PipelineCache,
        kernelWeights: Float32Array,
        biasVector: Float32Array,
        dims: ConvTransposeDimensions,
        activation?: string,
    ) {
        this.activation = activation ?? 'identity';

        const expectedWeights = dims.inputChannels * dims.outputChannels *
            dims.kernelHeight * dims.kernelWidth;
        if (kernelWeights.length !== expectedWeights) {
            throw new Error(
                `ConvTranspose weights mismatch: expected ${expectedWeights}, got ${kernelWeights.length}`,
            );
        }
        if (biasVector.length !== dims.outputChannels) {
            throw new Error(
                `ConvTranspose biases mismatch: expected ${dims.outputChannels}, got ${biasVector.length}`,
            );
        }

        this.inSize = dims.inputChannels * dims.inputHeight * dims.inputWidth;
        this.outSize = dims.outputChannels * dims.outputHeight * dims.outputWidth;

        const kernelWeightsBuffer = this.root.createBuffer(
            d.arrayOf(d.f32, kernelWeights.length),
            Array.from(kernelWeights),
        ).$usage('storage');

        const biasesBuffer = this.root.createBuffer(
            d.arrayOf(d.f32, biasVector.length),
            Array.from(biasVector),
        ).$usage('storage');

        const dimsArray = [
            dims.inputChannels,
            dims.outputChannels,
            dims.inputHeight,
            dims.inputWidth,
            dims.kernelHeight,
            dims.kernelWidth,
            dims.strideH,
            dims.strideW,
            dims.padH,
            dims.padW,
            dims.outputHeight,
            dims.outputWidth,
        ];

        const dimsBuffer = this.root.createBuffer(
            d.arrayOf(d.u32, dimsArray.length),
            dimsArray,
        ).$usage('storage');

        this.paramsBindGroup = this.root.createBindGroup(convWeightsLayout, {
            weights: kernelWeightsBuffer,
            biases: biasesBuffer,
            dims: dimsBuffer,
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

        const activationFn = this.activation === 'relu' ? relu : identity;
        const pipeline = this.pipelineCache.get({
            kind: 'ConvTranspose',
            compute: convTransposeCompute,
        }, {
            kind: (this.activation ?? 'identity') as Activation['kind'],
            fn: activationFn,
        });

        pipeline
            .with(ioLayout, ioBindGroup)
            .with(convWeightsLayout, this.paramsBindGroup)
            .dispatchWorkgroups(Math.ceil(this.outSize / workgroupSize));

        await this.root.device.queue.onSubmittedWorkDone();
    }
}
