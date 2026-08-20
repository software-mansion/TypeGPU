export const DepthModel = {
  SmallRelative448: 'depthart-relative-s-448',
  BaseRelative448: 'depthart-relative-b-448',
  LargeRelative448: 'depthart-relative-l-448',
} as const;
export type DepthModel = (typeof DepthModel)[keyof typeof DepthModel];

export const DepthInputKind = {
  NormalizedRgbTensor: 'normalized-rgb-tensor',
  SrgbImage: 'srgb-image',
} as const;
export type DepthInputKind = (typeof DepthInputKind)[keyof typeof DepthInputKind];

export const DepthOutputKind = {
  RelativeDisparity: 'relative-disparity',
} as const;
export type DepthOutputKind = (typeof DepthOutputKind)[keyof typeof DepthOutputKind];

export const DepthPrecision = {
  F32Reference: 'f32-reference',
  Fp16Native: 'fp16-native',
} as const;
export type DepthPrecision = (typeof DepthPrecision)[keyof typeof DepthPrecision];

export const DepthFeature = {
  ShaderF16: 'shader-f16',
  Subgroups: 'subgroups',
  PackedDotProduct: 'packed-4x8-integer-dot-product',
} as const;
export type DepthFeature = (typeof DepthFeature)[keyof typeof DepthFeature];

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

export const DepthOp = {
  Conv2d: 'conv2d',
  DepthwiseConv2d: 'depthwise-conv2d',
  Activation: 'activation',
  Binary: 'binary',
  ChannelAffine: 'channel-affine',
  AveragePool2d: 'avg-pool2d',
  Resize2d: 'resize2d',
  LayerNorm: 'layer-norm',
  ScanProject: 'scan-project',
  SelectiveScan: 'selective-scan',
  ScanMerge: 'scan-merge',
  ChannelSplit: 'channel-split',
  ChannelConcat: 'channel-concat',
} as const;
export type DepthOp = (typeof DepthOp)[keyof typeof DepthOp];

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
export type DepthShape4 = readonly [number, number, number, number];
export type DepthSize2 = readonly [height: number, width: number];
export type DepthPadding4 = readonly [top: number, left: number, bottom: number, right: number];
export type DepthWorkgroups = readonly [x: number, y: number, z: number];

export interface DepthProvenance {
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly sourceArtifact: string;
  readonly sourceSha256: string;
  readonly license: string;
  readonly converter: string;
}

export interface DepthInput {
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

export interface DepthOutput {
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
  /** Number and arrangement of encoded units in storage */
  readonly storageShape: DepthShape;
  readonly dtype: DepthDType;
  readonly layout: DepthTensorLayout;
  readonly byteLength: number;
  readonly storage: DepthTensorStorage;
}

export interface DepthSlot {
  readonly id: DepthSlotId;
  readonly byteLength: number;
  readonly alignment: number;
}

export interface DepthWeightSection {
  readonly id: DepthSectionId;
  /** Offset from the start of DepthBundle.payload */
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly alignment: number;
  readonly crc32: string;
  /** A zero-copy view into the source bundle */
  readonly bytes: Uint8Array;
}

export interface DepthDispatchBase {
  readonly id: DepthDispatchId;
  readonly inputs: readonly DepthTensorId[];
  readonly outputs: readonly DepthTensorId[];
  readonly workgroups: DepthWorkgroups;
}

export interface DepthConv2dParams {
  readonly kernel: DepthSize2;
  readonly stride: DepthSize2;
  readonly padding: DepthPadding4;
  readonly groups: number;
  readonly activation: DepthActivation;
  readonly weightPacking: 'o4i4-yx' | 'c4-yx';
  readonly biasPacking: 'c4';
}

export interface DepthActivationParams {
  readonly kind: Exclude<DepthActivation, 'none'>;
}

export interface DepthBinaryParams {
  readonly kind: DepthBinaryKind;
  readonly broadcast: DepthBroadcast;
}

export interface DepthChannelAffineParams {
  readonly axis: 1;
}

export interface DepthAveragePool2dParams {
  readonly kernel: DepthSize2;
  readonly stride: DepthSize2;
  readonly padding: DepthPadding4;
  readonly countIncludePad: boolean;
}

export interface DepthResize2dParams {
  readonly mode: DepthResizeMode;
  readonly coordinateMode: DepthResizeCoordinateMode;
  readonly size: DepthSize2;
}

export interface DepthLayerNormParams {
  readonly axis: number;
  readonly epsilon: number;
}

export interface DepthScanProjectParams {
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

export interface DepthSelectiveScanParams {
  readonly directions: 4;
  readonly stateSize: 8;
  readonly length: number;
  readonly deltaSoftplus: true;
  readonly fp32Recurrence: true;
}

export interface DepthScanMergeParams {
  readonly directions: 4;
  readonly transposeColumnMajor: true;
  readonly reduction: 'sum';
  readonly normalization: 'none';
}

export interface DepthChannelSplitParams {
  readonly axis: 1;
  readonly splitChannels: readonly [lowChannels: number, highChannels: number];
}

export interface DepthChannelConcatParams {
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
  readonly schema: 'depthart.bundle.v1';
  readonly model: DepthModel;
  readonly precision: DepthPrecision;
  readonly provenance: DepthProvenance;
  readonly requiredFeatures: readonly DepthFeature[];
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
