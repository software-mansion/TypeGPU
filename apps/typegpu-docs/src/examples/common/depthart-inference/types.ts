type DepthModel = 'depthart-relative-s-448' | 'depthart-relative-b-448' | 'depthart-relative-l-448';

type DepthInputKind = 'normalized-rgb-tensor' | 'srgb-image';

type DepthOutputKind = 'relative-disparity';

export const DepthPrecision = {
  F32Reference: 'f32-reference',
  Fp16Native: 'fp16-native',
} as const;
export type DepthPrecision = (typeof DepthPrecision)[keyof typeof DepthPrecision];

export const DepthDType = {
  F32: 'f32',
  F16: 'f16',
} as const;
export type DepthDType = (typeof DepthDType)[keyof typeof DepthDType];

export const DepthTensorLayout = {
  Raw: 'raw',
  Nchw: 'nchw',
  Nhwc: 'nhwc',
  Hwc4: 'hwc4',
  Chw4: 'chw4',
  C4: 'c4',
  O4I4Yx: 'o4i4-yx',
  C4Yx: 'c4-yx',
  DirectionO4I4: 'direction-o4i4',
} as const;
export type DepthTensorLayout = (typeof DepthTensorLayout)[keyof typeof DepthTensorLayout];

type DepthOp = DepthDispatch['op'];

export const DepthActivation = {
  None: 'none',
  Gelu: 'gelu',
  Silu: 'silu',
  Relu: 'relu',
} as const;
export type DepthActivation = (typeof DepthActivation)[keyof typeof DepthActivation];

export const DepthBinaryKind = {
  Add: 'add',
  Subtract: 'sub',
  Multiply: 'mul',
} as const;
export type DepthBinaryKind = (typeof DepthBinaryKind)[keyof typeof DepthBinaryKind];

export const DepthBroadcast = {
  None: 'none',
  Scalar: 'scalar',
  Channels: 'channels',
  Spatial: 'spatial',
} as const;
export type DepthBroadcast = (typeof DepthBroadcast)[keyof typeof DepthBroadcast];

export const DepthResizeMode = {
  Nearest: 'nearest',
  Bilinear: 'bilinear',
} as const;
export type DepthResizeMode = (typeof DepthResizeMode)[keyof typeof DepthResizeMode];

export const DepthResizeCoordinateMode = {
  AsymmetricFloor: 'asymmetric-floor',
  HalfPixel: 'half-pixel',
  AlignCorners: 'align-corners',
} as const;
export type DepthResizeCoordinateMode =
  (typeof DepthResizeCoordinateMode)[keyof typeof DepthResizeCoordinateMode];

export type DepthTensorId = string;
export type DepthSlotId = string;
export type DepthSectionId = string;
export type DepthDispatchId = string;

export type DepthShape = readonly number[];
export type DepthSize2 = readonly [height: number, width: number];
export type DepthPadding4 = readonly [top: number, left: number, bottom: number, right: number];
export type DepthWorkgroups = readonly [x: number, y: number, z: number];

interface DepthInput {
  readonly kind: DepthInputKind;
  readonly tensorId: DepthTensorId;
  readonly colorSpace: 'rgb';
  readonly resize: 'cubic-warp';
  readonly mean: readonly [number, number, number];
  readonly std: readonly [number, number, number];
}

/** Sign convention of a checkpoint's relative disparity */
export const DepthOutputPolarity = {
  Direct: 'direct',
  Inverted: 'inverted',
} as const;
export type DepthOutputPolarity = (typeof DepthOutputPolarity)[keyof typeof DepthOutputPolarity];

interface DepthOutput {
  readonly kind: DepthOutputKind;
  readonly tensorId: DepthTensorId;
  readonly resize: 'bilinear-align-corners';
  readonly polarity: DepthOutputPolarity;
}

export type DepthTensorStorage =
  | { readonly kind: 'input' }
  | { readonly kind: 'output' }
  | { readonly kind: 'slot'; readonly slotId: DepthSlotId }
  | {
      readonly kind: 'section';
      readonly sectionId: DepthSectionId;
      /** Offset from the start of the section */
      readonly byteOffset: number;
    };

export interface DepthTensor {
  readonly id: DepthTensorId;
  /** Logical model shape */
  readonly shape: DepthShape;
  readonly dtype: DepthDType;
  readonly layout: DepthTensorLayout;
  readonly byteLength: number;
  readonly storage: DepthTensorStorage;
}

export interface DepthSlot {
  readonly id: DepthSlotId;
  readonly byteLength: number;
}

export interface DepthWeightSection {
  readonly id: DepthSectionId;
  /** Offset from the start of DepthBundle.payload */
  readonly byteOffset: number;
  readonly byteLength: number;
  /** A zero-copy view into the source bundle */
  readonly bytes: Uint8Array;
}

interface DepthDispatchBase {
  readonly id: DepthDispatchId;
  readonly inputs: readonly DepthTensorId[];
  readonly outputs: readonly DepthTensorId[];
  readonly workgroups: DepthWorkgroups;
}

interface DepthConv2dParams {
  readonly kernel: DepthSize2;
  readonly stride: DepthSize2;
  readonly padding: DepthPadding4;
  readonly groups: number;
  readonly activation: DepthActivation;
  readonly weightPacking: 'o4i4-yx' | 'c4-yx';
  readonly biasPacking: 'c4';
}

interface DepthActivationParams {
  readonly kind: Exclude<DepthActivation, 'none'>;
}

interface DepthBinaryParams {
  readonly kind: DepthBinaryKind;
  readonly broadcast: DepthBroadcast;
}

interface DepthChannelAffineParams {
  readonly axis: 1;
}

interface DepthAveragePool2dParams {
  readonly kernel: DepthSize2;
  readonly stride: DepthSize2;
  readonly padding: DepthPadding4;
  readonly countIncludePad: boolean;
}

interface DepthResize2dParams {
  readonly mode: DepthResizeMode;
  readonly coordinateMode: DepthResizeCoordinateMode;
  readonly size: DepthSize2;
}

interface DepthLayerNormParams {
  readonly axis: number;
  readonly epsilon: number;
}

interface DepthScanProjectParams {
  readonly directions: 4;
  readonly stateSize: 8;
  readonly dtRank: number;
  readonly lowChannels: number;
  readonly sequence: {
    readonly rowMajor: true;
    readonly columnMajor: true;
    readonly reverse: true;
  };
}

interface DepthSelectiveScanParams {
  readonly directions: 4;
  readonly stateSize: 8;
  readonly length: number;
  readonly deltaSoftplus: true;
  readonly fp32Recurrence: true;
}

interface DepthScanMergeParams {
  readonly directions: 4;
  readonly transposeColumnMajor: true;
  readonly reduction: 'sum';
  readonly normalization: 'none';
}

interface DepthChannelSplitParams {
  readonly axis: 1;
  readonly splitChannels: readonly [lowChannels: number, highChannels: number];
}

interface DepthChannelConcatParams {
  readonly axis: 1;
}

export type DepthDispatch =
  | (DepthDispatchBase & {
      readonly op: 'conv2d' | 'depthwise-conv2d';
      readonly params: DepthConv2dParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'activation';
      readonly params: DepthActivationParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'binary';
      readonly params: DepthBinaryParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'channel-affine';
      readonly params: DepthChannelAffineParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'avg-pool2d';
      readonly params: DepthAveragePool2dParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'resize2d';
      readonly params: DepthResize2dParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'layer-norm';
      readonly params: DepthLayerNormParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'scan-project';
      readonly params: DepthScanProjectParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'selective-scan';
      readonly params: DepthSelectiveScanParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'scan-merge';
      readonly params: DepthScanMergeParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'channel-split';
      readonly params: DepthChannelSplitParams;
    })
  | (DepthDispatchBase & {
      readonly op: 'channel-concat';
      readonly params: DepthChannelConcatParams;
    });

export type DepthDispatchOf<TOp extends DepthOp> = Extract<DepthDispatch, { op: TOp }>;

export interface DepthBundle {
  readonly model: DepthModel;
  readonly precision: DepthPrecision;
  readonly input: DepthInput;
  readonly output: DepthOutput;
  readonly tensors: readonly DepthTensor[];
  readonly tensorById: ReadonlyMap<DepthTensorId, DepthTensor>;
  readonly slots: readonly DepthSlot[];
  readonly dispatches: readonly DepthDispatch[];
  readonly weightSections: readonly DepthWeightSection[];
  readonly weightSectionById: ReadonlyMap<DepthSectionId, DepthWeightSection>;
  /** One zero-copy view spanning every aligned weight section and its padding */
  readonly payload: Uint8Array;
}
