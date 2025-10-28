import { NNLayer } from "../gpuLayer";


export interface NNActivationLayer {
    call(): NNLayer;
}