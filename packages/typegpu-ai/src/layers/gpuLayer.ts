import { type StorageFlag, type TgpuBuffer } from 'typegpu';
import * as d from 'typegpu/data';

export interface NNLayer {
    inSize: number;
    outSize: number;
    activation: string | undefined;
    run(
        input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
        output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    ): Promise<void>;
}