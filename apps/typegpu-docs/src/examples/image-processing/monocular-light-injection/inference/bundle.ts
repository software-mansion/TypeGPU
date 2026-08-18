import {
  DepthActivation,
  DepthBinaryKind,
  DepthBroadcast,
  DepthDType,
  DepthFeature,
  DepthInputKind,
  DepthModel,
  DepthOp,
  DepthOutputKind,
  DepthOutputPolarity,
  DepthPrecision,
  DepthResizeCoordinateMode,
  DepthResizeMode,
  DepthTensorLayout,
  type DepthActivationParams,
  type DepthAveragePool2dParams,
  type DepthBinaryParams,
  type DepthBundle,
  type DepthChannelConcatParams,
  type DepthChannelSplitParams,
  type DepthConv2dParams,
  type DepthDispatch,
  type DepthFeature as DepthFeatureValue,
  type DepthInput,
  type DepthLayerNormParams,
  type DepthOutput,
  type DepthProvenance,
  type DepthResize2dParams,
  type DepthScanMergeParams,
  type DepthScanProjectParams,
  type DepthSelectiveScanParams,
  type DepthShape,
  type DepthShape4,
  type DepthSlot,
  type DepthTensor,
  type DepthTensorStorage,
  type DepthWeightSection,
} from './types.ts';

export * from './types.ts';

export const DEPTH_BUNDLE_MAGIC = 'DARTBND\0';
export const DEPTH_BUNDLE_VERSION = 1;
export const DEPTH_BUNDLE_HEADER_BYTES = 48;
export const DEPTH_BUNDLE_PAYLOAD_ALIGNMENT = 256;
export const DEPTH_BUNDLE_CHECKSUM_BYTE_OFFSET = 36;

const ENDIAN_TAG = 0x04030201;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_COLLECTION_LENGTH = 100_000;
const MAX_ID_LENGTH = 256;
const MAX_STRING_LENGTH = 4096;
const MAX_SHAPE_RANK = 8;
const MAX_WORKGROUPS_PER_DIMENSION = 65_535;
const U32_MAX = 0xffff_ffff;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const CRC32_PATTERN = /^[0-9a-f]{8}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const DepthBundleErrorCode = {
  Header: 'header',
  UnsupportedVersion: 'unsupported-version',
  Truncated: 'truncated',
  Checksum: 'checksum',
  Manifest: 'manifest',
  InvalidEnum: 'invalid-enum',
  DuplicateId: 'duplicate-id',
  Shape: 'shape',
  Bounds: 'bounds',
  Alignment: 'alignment',
  Overlap: 'overlap',
  Reference: 'reference',
  Graph: 'graph',
  Fetch: 'fetch',
} as const;
export type DepthBundleErrorCode = (typeof DepthBundleErrorCode)[keyof typeof DepthBundleErrorCode];

export class DepthBundleError extends Error {
  readonly code: DepthBundleErrorCode;
  readonly path: string;

  constructor(code: DepthBundleErrorCode, path: string, message: string, options?: ErrorOptions) {
    super(`${path}: ${message}`, options);
    this.name = 'DepthBundleError';
    this.code = code;
    this.path = path;
  }
}

interface Header {
  readonly manifestByteOffset: number;
  readonly manifestByteLength: number;
  readonly bundleByteLength: number;
  readonly manifestCrc32: number;
  readonly bundleCrc32: number;
}

interface ParsedSections {
  readonly sections: DepthWeightSection[];
  readonly sectionById: Map<string, DepthWeightSection>;
  readonly payload: Uint8Array;
}

type JsonObject = Record<string, unknown>;

const modelValues = Object.values(DepthModel);
const inputKindValues = Object.values(DepthInputKind);
const outputKindValues = Object.values(DepthOutputKind);
const outputPolarityValues = Object.values(DepthOutputPolarity);
const precisionValues = Object.values(DepthPrecision);
const featureValues = Object.values(DepthFeature);
const dtypeValues = Object.values(DepthDType);
const layoutValues = Object.values(DepthTensorLayout);
const opValues = Object.values(DepthOp);
const activationValues = Object.values(DepthActivation);
const nonIdentityActivationValues = activationValues.filter(
  (activation): activation is Exclude<(typeof activationValues)[number], 'none'> =>
    activation !== DepthActivation.None,
);
const binaryKindValues = Object.values(DepthBinaryKind);
const broadcastValues = Object.values(DepthBroadcast);
const resizeModeValues = Object.values(DepthResizeMode);
const resizeCoordinateModeValues = Object.values(DepthResizeCoordinateMode);

const crc32Table = new Uint32Array(256);
for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 0 ? value >>> 1 : 0xedb88320 ^ (value >>> 1);
  }
  crc32Table[index] = value >>> 0;
}

/** Computes the IEEE CRC-32 used by DepthART bundle headers and sections. */
export function crc32(source: ArrayBuffer | Uint8Array): number {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  return crc32Range(bytes);
}

export async function loadDepthBundle(url: string | URL, init?: RequestInit): Promise<DepthBundle> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new DepthBundleError(
      DepthBundleErrorCode.Fetch,
      'fetch',
      `could not fetch ${String(url)}`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new DepthBundleError(
      DepthBundleErrorCode.Fetch,
      'fetch',
      `${String(url)} returned ${response.status} ${response.statusText}`,
    );
  }

  return parseDepthBundle(await response.arrayBuffer());
}

/**
 * Parses and fully validates a DepthART bundle without allocating GPU resources.
 * Returned payload and section byte arrays are zero-copy views of `buffer`.
 */
export function parseDepthBundle(buffer: ArrayBuffer): DepthBundle {
  const bytes = new Uint8Array(buffer);
  const header = parseHeader(bytes);
  const manifestBytes = bytes.subarray(
    header.manifestByteOffset,
    header.manifestByteOffset + header.manifestByteLength,
  );

  const actualManifestCrc32 = crc32Range(manifestBytes);
  if (actualManifestCrc32 !== header.manifestCrc32) {
    fail(
      DepthBundleErrorCode.Checksum,
      'header.manifestCrc32',
      `expected ${hex32(header.manifestCrc32)}, got ${hex32(actualManifestCrc32)}`,
    );
  }

  const actualBundleCrc32 = crc32Range(
    bytes,
    DEPTH_BUNDLE_CHECKSUM_BYTE_OFFSET,
    DEPTH_BUNDLE_CHECKSUM_BYTE_OFFSET + 4,
  );
  if (actualBundleCrc32 !== header.bundleCrc32) {
    fail(
      DepthBundleErrorCode.Checksum,
      'header.bundleCrc32',
      `expected ${hex32(header.bundleCrc32)}, got ${hex32(actualBundleCrc32)}`,
    );
  }

  const manifest = decodeManifest(manifestBytes);
  const root = readObject(
    manifest,
    'manifest',
    [
      'schema',
      'model',
      'precision',
      'provenance',
      'requiredFeatures',
      'optionalFeatures',
      'input',
      'output',
      'tensors',
      'slots',
      'dispatches',
      'weightSections',
    ],
    [],
  );

  const schema = readLiteral(root.schema, 'depthart.bundle.v1', 'manifest.schema');
  const model = readEnum(root.model, modelValues, 'manifest.model');
  const precision = readEnum(root.precision, precisionValues, 'manifest.precision');
  const provenance = parseProvenance(root.provenance);
  const requiredFeatures = parseFeatures(root.requiredFeatures, 'manifest.requiredFeatures');
  if (
    precision === DepthPrecision.Fp16Native &&
    !requiredFeatures.includes(DepthFeature.ShaderF16)
  ) {
    fail(
      DepthBundleErrorCode.Manifest,
      'manifest.requiredFeatures',
      `${JSON.stringify(DepthFeature.ShaderF16)} is required by fp16-native`,
    );
  }

  const sections = parseSections(
    root.weightSections,
    bytes,
    header.manifestByteOffset + header.manifestByteLength,
  );
  const slots = parseSlots(root.slots);
  const tensors = parseTensors(
    root.tensors,
    toUniqueMap(slots, 'manifest.slots'),
    sections.sectionById,
  );
  const tensorById = toUniqueMap(tensors, 'manifest.tensors');

  const input = parseInput(root.input, tensorById);
  const output = parseOutput(root.output, tensorById);
  validateIoTensors(tensors, input, output);

  const dispatches = parseDispatches(root.dispatches, tensorById);
  validateGraph(dispatches, tensors, input, output);

  return {
    schema,
    model,
    precision,
    provenance,
    requiredFeatures,
    input,
    output,
    tensors,
    tensorById,
    slots,
    dispatches,
    weightSections: sections.sections,
    weightSectionById: sections.sectionById,
    payload: sections.payload,
  };
}

function parseHeader(bytes: Uint8Array): Header {
  if (bytes.byteLength < DEPTH_BUNDLE_HEADER_BYTES) {
    fail(
      DepthBundleErrorCode.Truncated,
      'header',
      `requires ${DEPTH_BUNDLE_HEADER_BYTES} bytes, got ${bytes.byteLength}`,
    );
  }
  if (bytes.byteLength > U32_MAX) {
    fail(DepthBundleErrorCode.Bounds, 'header.bundleByteLength', 'bundle exceeds uint32 offsets');
  }

  for (let index = 0; index < DEPTH_BUNDLE_MAGIC.length; index += 1) {
    if (bytes[index] !== DEPTH_BUNDLE_MAGIC.charCodeAt(index)) {
      fail(
        DepthBundleErrorCode.Header,
        'header.magic',
        `expected ${JSON.stringify(DEPTH_BUNDLE_MAGIC)}`,
      );
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(8, true);
  if (version !== DEPTH_BUNDLE_VERSION) {
    fail(
      DepthBundleErrorCode.UnsupportedVersion,
      'header.formatVersion',
      `expected ${DEPTH_BUNDLE_VERSION}, got ${version}`,
    );
  }

  const headerByteLength = view.getUint32(12, true);
  if (headerByteLength !== DEPTH_BUNDLE_HEADER_BYTES) {
    fail(
      DepthBundleErrorCode.Header,
      'header.headerByteLength',
      `expected ${DEPTH_BUNDLE_HEADER_BYTES}, got ${headerByteLength}`,
    );
  }

  const endianTag = view.getUint32(16, true);
  if (endianTag !== ENDIAN_TAG) {
    fail(
      DepthBundleErrorCode.Header,
      'header.endianTag',
      `expected 0x${ENDIAN_TAG.toString(16)}, got 0x${endianTag.toString(16)}`,
    );
  }

  const manifestByteOffset = view.getUint32(20, true);
  const manifestByteLength = view.getUint32(24, true);
  const bundleByteLength = view.getUint32(28, true);
  const manifestCrc32 = view.getUint32(32, true);
  const bundleCrc32 = view.getUint32(36, true);
  const flags = view.getUint32(40, true);
  const reserved = view.getUint32(44, true);

  if (manifestByteOffset !== DEPTH_BUNDLE_HEADER_BYTES) {
    fail(
      DepthBundleErrorCode.Header,
      'header.manifestByteOffset',
      `expected ${DEPTH_BUNDLE_HEADER_BYTES}, got ${manifestByteOffset}`,
    );
  }
  if (manifestByteLength === 0 || manifestByteLength > MAX_MANIFEST_BYTES) {
    fail(
      DepthBundleErrorCode.Bounds,
      'header.manifestByteLength',
      `must be between 1 and ${MAX_MANIFEST_BYTES}, got ${manifestByteLength}`,
    );
  }
  if (bundleByteLength !== bytes.byteLength) {
    fail(
      bytes.byteLength < bundleByteLength
        ? DepthBundleErrorCode.Truncated
        : DepthBundleErrorCode.Bounds,
      'header.bundleByteLength',
      `declares ${bundleByteLength} bytes, got ${bytes.byteLength}`,
    );
  }
  assertRange(
    manifestByteOffset,
    manifestByteLength,
    bundleByteLength,
    'header.manifestByteLength',
  );
  if (flags !== 0) {
    fail(DepthBundleErrorCode.Header, 'header.flags', `unsupported flags 0x${flags.toString(16)}`);
  }
  if (reserved !== 0) {
    fail(DepthBundleErrorCode.Header, 'header.reserved', 'must be zero');
  }

  return {
    manifestByteOffset,
    manifestByteLength,
    bundleByteLength,
    manifestCrc32,
    bundleCrc32,
  };
}

function decodeManifest(bytes: Uint8Array): unknown {
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    throw new DepthBundleError(DepthBundleErrorCode.Manifest, 'manifest', 'is not valid UTF-8', {
      cause,
    });
  }

  try {
    return JSON.parse(json) as unknown;
  } catch (cause) {
    throw new DepthBundleError(DepthBundleErrorCode.Manifest, 'manifest', 'is not valid JSON', {
      cause,
    });
  }
}

function parseProvenance(value: unknown): DepthProvenance {
  const path = 'manifest.provenance';
  const object = readObject(
    value,
    path,
    [
      'sourceRepository',
      'sourceRevision',
      'sourceArtifact',
      'sourceSha256',
      'license',
      'converter',
    ],
    [],
  );
  const sourceSha256 = readString(object.sourceSha256, `${path}.sourceSha256`);
  if (!SHA256_PATTERN.test(sourceSha256)) {
    fail(DepthBundleErrorCode.Manifest, `${path}.sourceSha256`, 'must be 64 lowercase hex digits');
  }

  return {
    sourceRepository: readString(object.sourceRepository, `${path}.sourceRepository`),
    sourceRevision: readString(object.sourceRevision, `${path}.sourceRevision`),
    sourceArtifact: readString(object.sourceArtifact, `${path}.sourceArtifact`),
    sourceSha256,
    license: readString(object.license, `${path}.license`),
    converter: readString(object.converter, `${path}.converter`),
  };
}

function parseFeatures(value: unknown, path: string): DepthFeatureValue[] {
  const array = readArray(value, path);
  const features = array.map((feature, index) =>
    readEnum(feature, featureValues, `${path}[${index}]`),
  );
  assertUniqueStrings(features, path);
  return features;
}

function parseSections(
  value: unknown,
  bundleBytes: Uint8Array,
  manifestEnd: number,
): ParsedSections {
  const rawSections = readArray(value, 'manifest.weightSections');
  if (rawSections.length === 0) {
    fail(DepthBundleErrorCode.Manifest, 'manifest.weightSections', 'must not be empty');
  }

  const payloadByteOffset = alignUp(manifestEnd, DEPTH_BUNDLE_PAYLOAD_ALIGNMENT);
  if (payloadByteOffset >= bundleBytes.byteLength) {
    fail(DepthBundleErrorCode.Truncated, 'payload', 'bundle ends before its aligned payload');
  }

  const parsed = rawSections.map((sectionValue, index) => {
    const path = `manifest.weightSections[${index}]`;
    const object = readObject(
      sectionValue,
      path,
      ['id', 'kind', 'byteOffset', 'byteLength', 'alignment', 'crc32'],
      ['sha256'],
    );
    const id = readId(object.id, `${path}.id`);
    const byteOffset = readU32(object.byteOffset, `${path}.byteOffset`);
    const byteLength = readPositiveU32(object.byteLength, `${path}.byteLength`);
    const alignment = readPositiveU32(object.alignment, `${path}.alignment`);
    const checksum = readString(object.crc32, `${path}.crc32`);

    if (!isPowerOfTwo(alignment) || alignment < DEPTH_BUNDLE_PAYLOAD_ALIGNMENT) {
      fail(
        DepthBundleErrorCode.Alignment,
        `${path}.alignment`,
        `must be a power of two at least ${DEPTH_BUNDLE_PAYLOAD_ALIGNMENT}`,
      );
    }
    if (byteOffset % alignment !== 0) {
      fail(
        DepthBundleErrorCode.Alignment,
        `${path}.byteOffset`,
        `${byteOffset} is not aligned to ${alignment}`,
      );
    }
    if (byteLength % 4 !== 0) {
      fail(DepthBundleErrorCode.Alignment, `${path}.byteLength`, 'must be a multiple of 4');
    }
    if (!CRC32_PATTERN.test(checksum)) {
      fail(DepthBundleErrorCode.Manifest, `${path}.crc32`, 'must be 8 lowercase hex digits');
    }

    const bundleByteOffset = safeAdd(payloadByteOffset, byteOffset, `${path}.byteOffset`);
    assertRange(bundleByteOffset, byteLength, bundleBytes.byteLength, `${path}.byteLength`);
    const sectionBytes = bundleBytes.subarray(bundleByteOffset, bundleByteOffset + byteLength);
    const actualChecksum = hex32(crc32Range(sectionBytes));
    if (actualChecksum !== checksum) {
      fail(
        DepthBundleErrorCode.Checksum,
        `${path}.crc32`,
        `expected ${checksum}, got ${actualChecksum}`,
      );
    }

    return {
      id,
      byteOffset,
      byteLength,
      alignment,
      crc32: checksum,
      bytes: sectionBytes,
    } satisfies DepthWeightSection;
  });

  const sectionById = toUniqueMap(parsed, 'manifest.weightSections');
  const byOffset = parsed.toSorted((left, right) => left.byteOffset - right.byteOffset);
  if (byOffset[0]?.byteOffset !== 0) {
    fail(
      DepthBundleErrorCode.Bounds,
      'manifest.weightSections',
      'first section must start at payload byte 0',
    );
  }

  let previousEnd = 0;
  for (let index = 0; index < byOffset.length; index += 1) {
    const section = byOffset[index];
    if (section === undefined) {
      continue;
    }
    if (section.byteOffset < previousEnd) {
      fail(
        DepthBundleErrorCode.Overlap,
        `manifest.weightSections[${index}]`,
        `section ${JSON.stringify(section.id)} overlaps the preceding section`,
      );
    }
    previousEnd = safeAdd(section.byteOffset, section.byteLength, 'manifest.weightSections');
  }

  const payloadEnd = safeAdd(payloadByteOffset, previousEnd, 'payload');
  if (payloadEnd !== bundleBytes.byteLength) {
    fail(
      DepthBundleErrorCode.Bounds,
      'payload',
      `ends at byte ${payloadEnd}, but bundle ends at ${bundleBytes.byteLength}`,
    );
  }

  return {
    sections: parsed,
    sectionById,
    payload: bundleBytes.subarray(payloadByteOffset, payloadEnd),
  };
}

function parseSlots(value: unknown): DepthSlot[] {
  return readArray(value, 'manifest.slots').map((slotValue, index) => {
    const path = `manifest.slots[${index}]`;
    const object = readObject(slotValue, path, ['id', 'byteLength', 'alignment'], []);
    const alignment = readPositiveU32(object.alignment, `${path}.alignment`);
    const byteLength = readPositiveU32(object.byteLength, `${path}.byteLength`);
    if (!isPowerOfTwo(alignment) || alignment < 4) {
      fail(
        DepthBundleErrorCode.Alignment,
        `${path}.alignment`,
        'must be a power of two at least 4',
      );
    }
    if (byteLength % alignment !== 0) {
      fail(
        DepthBundleErrorCode.Alignment,
        `${path}.byteLength`,
        `${byteLength} is not aligned to ${alignment}`,
      );
    }
    return { id: readId(object.id, `${path}.id`), byteLength, alignment };
  });
}

function parseTensors(
  value: unknown,
  slotById: ReadonlyMap<string, DepthSlot>,
  sectionById: ReadonlyMap<string, DepthWeightSection>,
): DepthTensor[] {
  const tensors = readArray(value, 'manifest.tensors').map((tensorValue, index) => {
    const path = `manifest.tensors[${index}]`;
    const object = readObject(
      tensorValue,
      path,
      ['id', 'shape', 'storageShape', 'dtype', 'encoding', 'layout', 'byteLength', 'storage'],
      [],
    );
    const shape = readShape(object.shape, `${path}.shape`);
    const storageShape = readShape(object.storageShape, `${path}.storageShape`);
    const dtype = readEnum(object.dtype, dtypeValues, `${path}.dtype`);
    readLiteral(object.encoding, 'plain', `${path}.encoding`);
    const layout = readEnum(object.layout, layoutValues, `${path}.layout`);
    const byteLength = readPositiveU32(object.byteLength, `${path}.byteLength`);
    const storageElements = shapeElementCount(storageShape, `${path}.storageShape`);
    const encodedUnitBytes = dtype === DepthDType.F32 ? 4 : 2;
    const expectedBytes = safeMultiply(storageElements, encodedUnitBytes, `${path}.storageShape`);
    if (byteLength !== expectedBytes) {
      fail(
        DepthBundleErrorCode.Shape,
        `${path}.byteLength`,
        `expected ${expectedBytes} bytes from storageShape/dtype, got ${byteLength}`,
      );
    }
    validateLayoutCapacity(shape, storageElements, layout, path);

    return {
      id: readId(object.id, `${path}.id`),
      shape,
      storageShape,
      dtype,
      layout,
      byteLength,
      storage: parseTensorStorage(
        object.storage,
        path,
        byteLength,
        encodedUnitBytes,
        slotById,
        sectionById,
      ),
    } satisfies DepthTensor;
  });

  toUniqueMap(tensors, 'manifest.tensors');
  return tensors;
}

function parseTensorStorage(
  value: unknown,
  tensorPath: string,
  byteLength: number,
  unitAlignment: number,
  slotById: ReadonlyMap<string, DepthSlot>,
  sectionById: ReadonlyMap<string, DepthWeightSection>,
): DepthTensorStorage {
  const path = `${tensorPath}.storage`;
  const object = readJsonObject(value, path);
  const kind = readEnum(
    object.kind,
    ['input', 'output', 'slot', 'section'] as const,
    `${path}.kind`,
  );

  if (kind === 'input' || kind === 'output') {
    assertObjectKeys(object, path, ['kind'], []);
    return { kind };
  }
  if (kind === 'slot') {
    assertObjectKeys(object, path, ['kind', 'slotId'], []);
    const slotId = readId(object.slotId, `${path}.slotId`);
    const slot = slotById.get(slotId);
    if (slot === undefined) {
      fail(
        DepthBundleErrorCode.Reference,
        `${path}.slotId`,
        `unknown slot ${JSON.stringify(slotId)}`,
      );
    }
    if (byteLength > slot.byteLength) {
      fail(
        DepthBundleErrorCode.Bounds,
        tensorPath,
        `requires ${byteLength} bytes, but slot ${JSON.stringify(slotId)} has ${slot.byteLength}`,
      );
    }
    return { kind, slotId };
  }

  assertObjectKeys(object, path, ['kind', 'sectionId', 'byteOffset'], []);
  const sectionId = readId(object.sectionId, `${path}.sectionId`);
  const section = sectionById.get(sectionId);
  if (section === undefined) {
    fail(
      DepthBundleErrorCode.Reference,
      `${path}.sectionId`,
      `unknown section ${JSON.stringify(sectionId)}`,
    );
  }
  const byteOffset = readU32(object.byteOffset, `${path}.byteOffset`);
  if (byteOffset % unitAlignment !== 0) {
    fail(
      DepthBundleErrorCode.Alignment,
      `${path}.byteOffset`,
      `${byteOffset} is not aligned to encoded unit size ${unitAlignment}`,
    );
  }
  assertRange(byteOffset, byteLength, section.byteLength, `${path}.byteOffset`);
  return { kind, sectionId, byteOffset };
}

function parseInput(value: unknown, tensorById: ReadonlyMap<string, DepthTensor>): DepthInput {
  const path = 'manifest.input';
  const object = readObject(
    value,
    path,
    ['kind', 'tensorId', 'colorSpace', 'resize', 'mean', 'std'],
    [],
  );
  const tensorId = readId(object.tensorId, `${path}.tensorId`);
  requireTensor(tensorById, tensorId, `${path}.tensorId`);
  const mean = readFiniteTuple3(object.mean, `${path}.mean`);
  const std = readFiniteTuple3(object.std, `${path}.std`);
  if (std.some((component) => component <= 0)) {
    fail(DepthBundleErrorCode.Manifest, `${path}.std`, 'all components must be positive');
  }
  return {
    kind: readEnum(object.kind, inputKindValues, `${path}.kind`),
    tensorId,
    colorSpace: readLiteral(object.colorSpace, 'rgb', `${path}.colorSpace`),
    resize: readLiteral(object.resize, 'cubic-warp', `${path}.resize`),
    mean,
    std,
  };
}

function parseOutput(value: unknown, tensorById: ReadonlyMap<string, DepthTensor>): DepthOutput {
  const path = 'manifest.output';
  const object = readObject(value, path, ['kind', 'tensorId', 'resize'], ['polarity']);
  const tensorId = readId(object.tensorId, `${path}.tensorId`);
  requireTensor(tensorById, tensorId, `${path}.tensorId`);
  return {
    kind: readEnum(object.kind, outputKindValues, `${path}.kind`),
    tensorId,
    resize: readLiteral(object.resize, 'bilinear-align-corners', `${path}.resize`),
    polarity:
      object.polarity === undefined
        ? DepthOutputPolarity.Direct
        : readEnum(object.polarity, outputPolarityValues, `${path}.polarity`),
  };
}

function validateIoTensors(
  tensors: readonly DepthTensor[],
  input: DepthInput,
  output: DepthOutput,
): void {
  const inputTensors = tensors.filter((tensor) => tensor.storage.kind === 'input');
  const outputTensors = tensors.filter((tensor) => tensor.storage.kind === 'output');
  if (inputTensors.length !== 1 || inputTensors[0]?.id !== input.tensorId) {
    fail(
      DepthBundleErrorCode.Reference,
      'manifest.input.tensorId',
      "must identify the bundle's only input-backed tensor",
    );
  }
  if (outputTensors.length !== 1 || outputTensors[0]?.id !== output.tensorId) {
    fail(
      DepthBundleErrorCode.Reference,
      'manifest.output.tensorId',
      "must identify the bundle's only output-backed tensor",
    );
  }

  const inputTensor = inputTensors[0];
  const outputTensor = outputTensors[0];
  if (inputTensor === undefined || outputTensor === undefined) {
    return;
  }
  assertExactShape(inputTensor.shape, [1, 3, 448, 448], 'manifest.input.tensorId');
  assertExactShape(outputTensor.shape, [1, 1, 448, 448], 'manifest.output.tensorId');
  if (inputTensor.dtype !== DepthDType.F32) {
    fail(DepthBundleErrorCode.Shape, 'manifest.input.tensorId', 'input must be plain f32');
  }
  if (outputTensor.dtype !== DepthDType.F32) {
    fail(DepthBundleErrorCode.Shape, 'manifest.output.tensorId', 'output must be plain f32');
  }
  if (inputTensor.layout !== DepthTensorLayout.Hwc4) {
    fail(DepthBundleErrorCode.Shape, 'manifest.input.tensorId', 'input must use HWC4 storage');
  }
  if (outputTensor.layout !== DepthTensorLayout.Hwc4) {
    fail(DepthBundleErrorCode.Shape, 'manifest.output.tensorId', 'output must use HWC4 storage');
  }
}

function parseDispatches(
  value: unknown,
  tensorById: ReadonlyMap<string, DepthTensor>,
): DepthDispatch[] {
  const dispatches = readArray(value, 'manifest.dispatches').map((dispatchValue, index) => {
    const path = `manifest.dispatches[${index}]`;
    const object = readObject(
      dispatchValue,
      path,
      ['id', 'op', 'inputs', 'outputs', 'workgroups', 'params'],
      [],
    );
    const id = readId(object.id, `${path}.id`);
    const op = readEnum(object.op, opValues, `${path}.op`);
    const inputs = readTensorIds(object.inputs, `${path}.inputs`, tensorById);
    const outputs = readTensorIds(object.outputs, `${path}.outputs`, tensorById);
    if (inputs.length === 0) {
      fail(DepthBundleErrorCode.Graph, `${path}.inputs`, 'must not be empty');
    }
    if (outputs.length === 0) {
      fail(DepthBundleErrorCode.Graph, `${path}.outputs`, 'must not be empty');
    }
    assertUniqueStrings(outputs, `${path}.outputs`);
    const workgroups = readWorkgroups(object.workgroups, `${path}.workgroups`);
    const base = { id, op, inputs, outputs, workgroups };

    switch (op) {
      case DepthOp.Conv2d:
      case DepthOp.DepthwiseConv2d:
        return checkedDispatch(
          { ...base, op, params: parseConvParams(object.params, path, op) },
          path,
        );
      case DepthOp.Activation:
        return checkedDispatch(
          { ...base, op, params: parseActivationParams(object.params, path) },
          path,
        );
      case DepthOp.Binary:
        return checkedDispatch(
          { ...base, op, params: parseBinaryParams(object.params, path) },
          path,
        );
      case DepthOp.ChannelAffine:
        return checkedDispatch(
          { ...base, op, params: parseChannelAffineParams(object.params, path) },
          path,
        );
      case DepthOp.AveragePool2d:
        return checkedDispatch(
          { ...base, op, params: parseAveragePoolParams(object.params, path) },
          path,
        );
      case DepthOp.Resize2d:
        return checkedDispatch(
          { ...base, op, params: parseResizeParams(object.params, path) },
          path,
        );
      case DepthOp.LayerNorm:
        return checkedDispatch(
          { ...base, op, params: parseLayerNormParams(object.params, path) },
          path,
        );
      case DepthOp.ScanProject:
        return checkedDispatch(
          { ...base, op, params: parseScanProjectParams(object.params, path) },
          path,
        );
      case DepthOp.SelectiveScan:
        return checkedDispatch(
          { ...base, op, params: parseSelectiveScanParams(object.params, path) },
          path,
        );
      case DepthOp.ScanMerge:
        return checkedDispatch(
          { ...base, op, params: parseScanMergeParams(object.params, path) },
          path,
        );
      case DepthOp.ChannelSplit:
        return checkedDispatch(
          { ...base, op, params: parseChannelSplitParams(object.params, path) },
          path,
        );
      case DepthOp.ChannelConcat:
        return checkedDispatch(
          { ...base, op, params: parseChannelConcatParams(object.params, path) },
          path,
        );
    }
  });

  toUniqueMap(dispatches, 'manifest.dispatches');
  for (let index = 0; index < dispatches.length; index += 1) {
    const dispatch = dispatches[index];
    if (dispatch !== undefined) {
      validateChannelViewDispatch(dispatch, tensorById, `manifest.dispatches[${index}]`);
      validateChannelAffineDispatch(dispatch, tensorById, `manifest.dispatches[${index}]`);
    }
  }
  return dispatches;
}

function checkedDispatch(dispatch: DepthDispatch, path: string): DepthDispatch {
  const [expectedInputs, expectedOutputs] = dispatchArity(dispatch.op);
  if (dispatch.inputs.length !== expectedInputs) {
    fail(
      DepthBundleErrorCode.Graph,
      `${path}.inputs`,
      `${dispatch.op} requires ${expectedInputs} inputs, got ${dispatch.inputs.length}`,
    );
  }
  if (dispatch.outputs.length !== expectedOutputs) {
    fail(
      DepthBundleErrorCode.Graph,
      `${path}.outputs`,
      `${dispatch.op} requires ${expectedOutputs} outputs, got ${dispatch.outputs.length}`,
    );
  }
  return dispatch;
}

function dispatchArity(op: DepthDispatch['op']): readonly [inputs: number, outputs: number] {
  switch (op) {
    case DepthOp.Conv2d:
    case DepthOp.DepthwiseConv2d:
      return [3, 1];
    case DepthOp.Activation:
    case DepthOp.AveragePool2d:
    case DepthOp.Resize2d:
    case DepthOp.ScanMerge:
      return [1, 1];
    case DepthOp.ChannelSplit:
      return [1, 2];
    case DepthOp.Binary:
    case DepthOp.ChannelConcat:
      return [2, 1];
    case DepthOp.LayerNorm:
    case DepthOp.ChannelAffine:
      return [3, 1];
    case DepthOp.ScanProject:
      return [3, 3];
    case DepthOp.SelectiveScan:
      return [7, 1];
  }
}

function parseConvParams(
  value: unknown,
  dispatchPath: string,
  op: 'conv2d' | 'depthwise-conv2d',
): DepthConv2dParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(
    value,
    path,
    ['kernel', 'stride', 'padding', 'groups', 'activation', 'weightPacking', 'biasPacking'],
    [],
  );
  const weightPacking = readEnum(
    object.weightPacking,
    ['o4i4-yx', 'c4-yx'] as const,
    `${path}.weightPacking`,
  );
  const expectedPacking = op === DepthOp.Conv2d ? 'o4i4-yx' : 'c4-yx';
  if (weightPacking !== expectedPacking) {
    fail(
      DepthBundleErrorCode.Manifest,
      `${path}.weightPacking`,
      `${op} requires ${JSON.stringify(expectedPacking)}`,
    );
  }
  return {
    kernel: readPositiveSize2(object.kernel, `${path}.kernel`),
    stride: readPositiveSize2(object.stride, `${path}.stride`),
    padding: readPadding4(object.padding, `${path}.padding`),
    groups: readPositiveU32(object.groups, `${path}.groups`),
    activation: readEnum(object.activation, activationValues, `${path}.activation`),
    weightPacking,
    biasPacking: readLiteral(object.biasPacking, 'c4', `${path}.biasPacking`),
  };
}

function parseActivationParams(value: unknown, dispatchPath: string): DepthActivationParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['kind'], []);
  return { kind: readEnum(object.kind, nonIdentityActivationValues, `${path}.kind`) };
}

function parseBinaryParams(value: unknown, dispatchPath: string): DepthBinaryParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['kind', 'broadcast'], []);
  return {
    kind: readEnum(object.kind, binaryKindValues, `${path}.kind`),
    broadcast: readEnum(object.broadcast, broadcastValues, `${path}.broadcast`),
  };
}

function parseChannelAffineParams(value: unknown, dispatchPath: string): { readonly axis: 1 } {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['axis'], []);
  return { axis: readLiteral(object.axis, 1, `${path}.axis`) };
}

function parseAveragePoolParams(value: unknown, dispatchPath: string): DepthAveragePool2dParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['kernel', 'stride', 'padding', 'countIncludePad'], []);
  return {
    kernel: readPositiveSize2(object.kernel, `${path}.kernel`),
    stride: readPositiveSize2(object.stride, `${path}.stride`),
    padding: readPadding4(object.padding, `${path}.padding`),
    countIncludePad: readBoolean(object.countIncludePad, `${path}.countIncludePad`),
  };
}

function parseResizeParams(value: unknown, dispatchPath: string): DepthResize2dParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['mode', 'coordinateMode', 'size'], []);
  return {
    mode: readEnum(object.mode, resizeModeValues, `${path}.mode`),
    coordinateMode: readEnum(
      object.coordinateMode,
      resizeCoordinateModeValues,
      `${path}.coordinateMode`,
    ),
    size: readPositiveSize2(object.size, `${path}.size`),
  };
}

function parseLayerNormParams(value: unknown, dispatchPath: string): DepthLayerNormParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['axis', 'epsilon'], []);
  const axis = readInteger(object.axis, `${path}.axis`);
  if (axis < -MAX_SHAPE_RANK || axis >= MAX_SHAPE_RANK) {
    fail(
      DepthBundleErrorCode.Manifest,
      `${path}.axis`,
      `must be between ${-MAX_SHAPE_RANK} and ${MAX_SHAPE_RANK - 1}`,
    );
  }
  const epsilon = readFiniteNumber(object.epsilon, `${path}.epsilon`);
  if (epsilon <= 0) {
    fail(DepthBundleErrorCode.Manifest, `${path}.epsilon`, 'must be positive');
  }
  return { axis, epsilon };
}

function parseScanProjectParams(value: unknown, dispatchPath: string): DepthScanProjectParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(
    value,
    path,
    ['directions', 'stateSize', 'dtRank', 'lowChannels', 'sequence'],
    [],
  );
  const sequencePath = `${path}.sequence`;
  const sequence = readObject(
    object.sequence,
    sequencePath,
    ['rowMajor', 'columnMajor', 'reverse'],
    [],
  );
  return {
    directions: readLiteral(object.directions, 4, `${path}.directions`),
    stateSize: readLiteral(object.stateSize, 8, `${path}.stateSize`),
    dtRank: readPositiveU32(object.dtRank, `${path}.dtRank`),
    lowChannels: readPositiveU32(object.lowChannels, `${path}.lowChannels`),
    sequence: {
      rowMajor: readLiteral(sequence.rowMajor, true, `${sequencePath}.rowMajor`),
      columnMajor: readLiteral(sequence.columnMajor, true, `${sequencePath}.columnMajor`),
      reverse: readLiteral(sequence.reverse, true, `${sequencePath}.reverse`),
    },
  };
}

function parseSelectiveScanParams(value: unknown, dispatchPath: string): DepthSelectiveScanParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(
    value,
    path,
    ['directions', 'stateSize', 'length', 'deltaSoftplus', 'fp32Recurrence'],
    [],
  );
  return {
    directions: readLiteral(object.directions, 4, `${path}.directions`),
    stateSize: readLiteral(object.stateSize, 8, `${path}.stateSize`),
    length: readPositiveU32(object.length, `${path}.length`),
    deltaSoftplus: readLiteral(object.deltaSoftplus, true, `${path}.deltaSoftplus`),
    fp32Recurrence: readLiteral(object.fp32Recurrence, true, `${path}.fp32Recurrence`),
  };
}

function parseScanMergeParams(value: unknown, dispatchPath: string): DepthScanMergeParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(
    value,
    path,
    ['directions', 'transposeColumnMajor', 'reduction', 'normalization'],
    [],
  );
  return {
    directions: readLiteral(object.directions, 4, `${path}.directions`),
    transposeColumnMajor: readLiteral(
      object.transposeColumnMajor,
      true,
      `${path}.transposeColumnMajor`,
    ),
    reduction: readLiteral(object.reduction, 'sum', `${path}.reduction`),
    normalization: readLiteral(object.normalization, 'none', `${path}.normalization`),
  };
}

function parseChannelSplitParams(value: unknown, dispatchPath: string): DepthChannelSplitParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['axis', 'splitChannels'], []);
  const rawChannels = readArray(object.splitChannels, `${path}.splitChannels`);
  if (rawChannels.length !== 2) {
    fail(
      DepthBundleErrorCode.Manifest,
      `${path}.splitChannels`,
      `must contain exactly two channel counts, got ${rawChannels.length}`,
    );
  }
  const lowChannels = readPositiveU32(rawChannels[0], `${path}.splitChannels[0]`);
  const highChannels = readPositiveU32(rawChannels[1], `${path}.splitChannels[1]`);
  if (lowChannels % 4 !== 0) {
    fail(
      DepthBundleErrorCode.Shape,
      `${path}.splitChannels[0]`,
      'must be a multiple of four for HWC4 block copying',
    );
  }
  if (highChannels % 4 !== 0) {
    fail(
      DepthBundleErrorCode.Shape,
      `${path}.splitChannels[1]`,
      'must be a multiple of four for HWC4 block copying',
    );
  }
  return {
    axis: readLiteral(object.axis, 1, `${path}.axis`),
    splitChannels: [lowChannels, highChannels],
  };
}

function parseChannelConcatParams(value: unknown, dispatchPath: string): DepthChannelConcatParams {
  const path = `${dispatchPath}.params`;
  const object = readObject(value, path, ['axis'], []);
  return { axis: readLiteral(object.axis, 1, `${path}.axis`) };
}

function channelViewShape(tensor: DepthTensor, path: string): DepthShape4 {
  if (
    tensor.dtype !== DepthDType.F32 ||
    tensor.layout !== DepthTensorLayout.Hwc4 ||
    tensor.shape.length !== 4
  ) {
    fail(
      DepthBundleErrorCode.Shape,
      path,
      `tensor ${JSON.stringify(tensor.id)} must be a rank-four FP32/plain HWC4 activation`,
    );
  }
  return tensor.shape as DepthShape4;
}

function channelViewTensor(
  tensorById: ReadonlyMap<string, DepthTensor>,
  tensorId: string | undefined,
  path: string,
): DepthTensor {
  const tensor = tensorId === undefined ? undefined : tensorById.get(tensorId);
  if (tensor === undefined) {
    fail(DepthBundleErrorCode.Reference, path, 'references a missing tensor');
  }
  return tensor;
}

function assertMatchingNhw(actual: DepthShape4, expected: DepthShape4, path: string): void {
  if (actual[0] !== expected[0] || actual[2] !== expected[2] || actual[3] !== expected[3]) {
    fail(
      DepthBundleErrorCode.Shape,
      path,
      `N/H/W dimensions [${actual[0]},${actual[2]},${actual[3]}] do not match [${expected[0]},${expected[2]},${expected[3]}]`,
    );
  }
}

function validateChannelViewDispatch(
  dispatch: DepthDispatch,
  tensorById: ReadonlyMap<string, DepthTensor>,
  path: string,
): void {
  if (dispatch.op === DepthOp.ChannelSplit) {
    const srcShape = channelViewShape(
      channelViewTensor(tensorById, dispatch.inputs[0], `${path}.inputs[0]`),
      `${path}.inputs[0]`,
    );
    const lowShape = channelViewShape(
      channelViewTensor(tensorById, dispatch.outputs[0], `${path}.outputs[0]`),
      `${path}.outputs[0]`,
    );
    const highShape = channelViewShape(
      channelViewTensor(tensorById, dispatch.outputs[1], `${path}.outputs[1]`),
      `${path}.outputs[1]`,
    );
    assertMatchingNhw(lowShape, srcShape, `${path}.outputs[0]`);
    assertMatchingNhw(highShape, srcShape, `${path}.outputs[1]`);
    const [lowChannels, highChannels] = dispatch.params.splitChannels;
    if (lowShape[1] !== lowChannels) {
      fail(
        DepthBundleErrorCode.Shape,
        `${path}.outputs[0]`,
        `has ${lowShape[1]} channels; params.splitChannels[0] declares ${lowChannels}`,
      );
    }
    if (highShape[1] !== highChannels) {
      fail(
        DepthBundleErrorCode.Shape,
        `${path}.outputs[1]`,
        `has ${highShape[1]} channels; params.splitChannels[1] declares ${highChannels}`,
      );
    }
    if (lowChannels + highChannels !== srcShape[1]) {
      fail(
        DepthBundleErrorCode.Shape,
        `${path}.params.splitChannels`,
        `sum ${lowChannels + highChannels} does not match input channels ${srcShape[1]}`,
      );
    }
    return;
  }

  if (dispatch.op === DepthOp.ChannelConcat) {
    const lowShape = channelViewShape(
      channelViewTensor(tensorById, dispatch.inputs[0], `${path}.inputs[0]`),
      `${path}.inputs[0]`,
    );
    const highShape = channelViewShape(
      channelViewTensor(tensorById, dispatch.inputs[1], `${path}.inputs[1]`),
      `${path}.inputs[1]`,
    );
    const dstShape = channelViewShape(
      channelViewTensor(tensorById, dispatch.outputs[0], `${path}.outputs[0]`),
      `${path}.outputs[0]`,
    );
    assertMatchingNhw(highShape, lowShape, `${path}.inputs[1]`);
    assertMatchingNhw(dstShape, lowShape, `${path}.outputs[0]`);
    if (lowShape[1] % 4 !== 0 || highShape[1] % 4 !== 0) {
      fail(
        DepthBundleErrorCode.Shape,
        `${path}.inputs`,
        'channel-concat inputs must have channel counts divisible by four',
      );
    }
    if (dstShape[1] !== lowShape[1] + highShape[1]) {
      fail(
        DepthBundleErrorCode.Shape,
        `${path}.outputs[0]`,
        `has ${dstShape[1]} channels; inputs sum to ${lowShape[1] + highShape[1]}`,
      );
    }
  }
}

function validateChannelAffineDispatch(
  dispatch: DepthDispatch,
  tensorById: ReadonlyMap<string, DepthTensor>,
  path: string,
): void {
  if (dispatch.op !== DepthOp.ChannelAffine) {
    return;
  }

  const src = channelViewTensor(tensorById, dispatch.inputs[0], `${path}.inputs[0]`);
  const scale = channelViewTensor(tensorById, dispatch.inputs[1], `${path}.inputs[1]`);
  const bias = channelViewTensor(tensorById, dispatch.inputs[2], `${path}.inputs[2]`);
  const dst = channelViewTensor(tensorById, dispatch.outputs[0], `${path}.outputs[0]`);
  const srcShape = channelViewShape(src, `${path}.inputs[0]`);
  const dstShape = channelViewShape(dst, `${path}.outputs[0]`);
  if (srcShape.some((dimension, index) => dimension !== dstShape[index])) {
    fail(
      DepthBundleErrorCode.Shape,
      `${path}.outputs[0]`,
      `shape [${dstShape.join(',')}] does not match input shape [${srcShape.join(',')}]`,
    );
  }

  for (const [tensor, tensorPath, role] of [
    [scale, `${path}.inputs[1]`, 'scale'],
    [bias, `${path}.inputs[2]`, 'bias'],
  ] as const) {
    if (
      tensor.dtype !== DepthDType.F32 ||
      tensor.layout !== DepthTensorLayout.C4 ||
      tensor.shape.length !== 1 ||
      tensor.shape[0] !== srcShape[1] ||
      tensor.storage.kind !== 'section'
    ) {
      fail(
        DepthBundleErrorCode.Shape,
        tensorPath,
        `${role} tensor ${JSON.stringify(tensor.id)} must be section-backed FP32/plain C4 with shape [${srcShape[1]}]`,
      );
    }
  }
}

function validateGraph(
  dispatches: readonly DepthDispatch[],
  tensors: readonly DepthTensor[],
  input: DepthInput,
  output: DepthOutput,
): void {
  if (dispatches.length === 0) {
    fail(DepthBundleErrorCode.Graph, 'manifest.dispatches', 'must not be empty');
  }

  const tensorById = new Map(tensors.map((tensor) => [tensor.id, tensor]));
  const available = new Set<string>();
  const currentTensorBySlot = new Map<string, string>();
  const produced = new Set<string>();
  const read = new Set<string>();
  for (const tensor of tensors) {
    if (tensor.storage.kind === 'input' || tensor.storage.kind === 'section') {
      available.add(tensor.id);
    }
  }

  for (let dispatchIndex = 0; dispatchIndex < dispatches.length; dispatchIndex += 1) {
    const dispatch = dispatches[dispatchIndex];
    if (dispatch === undefined) {
      continue;
    }
    const path = `manifest.dispatches[${dispatchIndex}]`;
    const inputSlots = new Set<string>();
    for (const tensorId of dispatch.inputs) {
      const tensor = tensorById.get(tensorId);
      if (tensor === undefined) {
        continue;
      }
      if (!available.has(tensorId)) {
        fail(
          DepthBundleErrorCode.Graph,
          `${path}.inputs`,
          `tensor ${JSON.stringify(tensorId)} is read before it is produced`,
        );
      }
      if (
        tensor.storage.kind === 'slot' &&
        currentTensorBySlot.get(tensor.storage.slotId) !== tensorId
      ) {
        fail(
          DepthBundleErrorCode.Graph,
          `${path}.inputs`,
          `tensor ${JSON.stringify(tensorId)} has been overwritten in slot ${JSON.stringify(tensor.storage.slotId)}`,
        );
      }
      if (tensor.storage.kind === 'output') {
        fail(DepthBundleErrorCode.Graph, `${path}.inputs`, 'the public output cannot be an input');
      }
      if (tensor.storage.kind === 'slot') {
        inputSlots.add(tensor.storage.slotId);
      }
      read.add(tensorId);
    }

    const outputSlots = new Set<string>();
    for (const tensorId of dispatch.outputs) {
      const tensor = tensorById.get(tensorId);
      if (tensor === undefined) {
        continue;
      }
      if (produced.has(tensorId) || available.has(tensorId)) {
        fail(
          DepthBundleErrorCode.Graph,
          `${path}.outputs`,
          `tensor ${JSON.stringify(tensorId)} is produced more than once`,
        );
      }
      if (tensor.storage.kind === 'input' || tensor.storage.kind === 'section') {
        fail(
          DepthBundleErrorCode.Graph,
          `${path}.outputs`,
          `cannot write ${tensor.storage.kind}-backed tensor ${JSON.stringify(tensorId)}`,
        );
      }
      if (tensor.storage.kind === 'slot') {
        if (inputSlots.has(tensor.storage.slotId)) {
          fail(
            DepthBundleErrorCode.Overlap,
            `${path}.outputs`,
            `output tensor ${JSON.stringify(tensorId)} aliases an input in slot ${JSON.stringify(tensor.storage.slotId)}`,
          );
        }
        if (outputSlots.has(tensor.storage.slotId)) {
          fail(
            DepthBundleErrorCode.Graph,
            `${path}.outputs`,
            `multiple outputs alias slot ${JSON.stringify(tensor.storage.slotId)}`,
          );
        }
        outputSlots.add(tensor.storage.slotId);
        const previousTensor = currentTensorBySlot.get(tensor.storage.slotId);
        if (previousTensor !== undefined) {
          available.delete(previousTensor);
        }
        currentTensorBySlot.set(tensor.storage.slotId, tensorId);
      } else if (tensorId !== output.tensorId) {
        fail(
          DepthBundleErrorCode.Graph,
          `${path}.outputs`,
          `unexpected output-backed tensor ${JSON.stringify(tensorId)}`,
        );
      }
      available.add(tensorId);
      produced.add(tensorId);
    }
  }

  if (!read.has(input.tensorId)) {
    fail(DepthBundleErrorCode.Graph, 'manifest.input.tensorId', 'input tensor is never read');
  }
  if (!produced.has(output.tensorId)) {
    fail(DepthBundleErrorCode.Graph, 'manifest.output.tensorId', 'output tensor is never produced');
  }
  for (const tensor of tensors) {
    if (tensor.storage.kind === 'section' && !read.has(tensor.id)) {
      fail(
        DepthBundleErrorCode.Graph,
        `tensor ${JSON.stringify(tensor.id)}`,
        'section-backed tensor is never read',
      );
    }
    if (tensor.storage.kind === 'slot' && !produced.has(tensor.id)) {
      fail(
        DepthBundleErrorCode.Graph,
        `tensor ${JSON.stringify(tensor.id)}`,
        'slot-backed tensor is never produced',
      );
    }
    if (tensor.storage.kind === 'slot' && tensor.id !== output.tensorId && !read.has(tensor.id)) {
      fail(
        DepthBundleErrorCode.Graph,
        `tensor ${JSON.stringify(tensor.id)}`,
        'slot-backed tensor is dead and never read',
      );
    }
  }
}

function validateLayoutCapacity(
  shape: DepthShape,
  storageCapacity: number,
  layout: (typeof layoutValues)[number],
  path: string,
): void {
  let expectedCapacity: number | undefined;
  switch (layout) {
    case DepthTensorLayout.Raw:
      return;
    case DepthTensorLayout.Nchw:
    case DepthTensorLayout.Nhwc:
      expectedCapacity = shapeElementCount(shape, `${path}.shape`);
      break;
    case DepthTensorLayout.Hwc4:
    case DepthTensorLayout.Chw4: {
      assertShapeRank(shape, 4, `${path}.shape`);
      const [batch, channels, height, width] = shape as readonly [number, number, number, number];
      expectedCapacity = multiplyAll(
        [batch, height, width, ceilTo4(channels)],
        `${path}.storageShape`,
      );
      break;
    }
    case DepthTensorLayout.C4: {
      assertShapeRank(shape, 1, `${path}.shape`);
      expectedCapacity = ceilTo4(shape[0] ?? 0);
      break;
    }
    case DepthTensorLayout.O4I4Yx: {
      assertShapeRank(shape, 4, `${path}.shape`);
      const [outputs, inputs, kernelHeight, kernelWidth] = shape as readonly [
        number,
        number,
        number,
        number,
      ];
      expectedCapacity = multiplyAll(
        [ceilTo4(outputs), ceilTo4(inputs), kernelHeight, kernelWidth],
        `${path}.storageShape`,
      );
      break;
    }
    case DepthTensorLayout.C4Yx: {
      assertShapeRank(shape, 4, `${path}.shape`);
      const [channels, multiplier, kernelHeight, kernelWidth] = shape as readonly [
        number,
        number,
        number,
        number,
      ];
      if (multiplier !== 1) {
        fail(DepthBundleErrorCode.Shape, `${path}.shape[1]`, 'depthwise multiplier must be 1');
      }
      expectedCapacity = multiplyAll(
        [ceilTo4(channels), kernelHeight, kernelWidth],
        `${path}.storageShape`,
      );
      break;
    }
    case DepthTensorLayout.DirectionO4I4: {
      assertShapeRank(shape, 3, `${path}.shape`);
      const [directions, outputs, inputs] = shape as readonly [number, number, number];
      expectedCapacity = multiplyAll(
        [directions, ceilTo4(outputs), ceilTo4(inputs)],
        `${path}.storageShape`,
      );
      break;
    }
  }

  if (storageCapacity !== expectedCapacity) {
    fail(
      DepthBundleErrorCode.Shape,
      `${path}.storageShape`,
      `${layout} requires capacity ${expectedCapacity}, got ${storageCapacity}`,
    );
  }
}

function assertShapeRank(shape: DepthShape, rank: number, path: string): void {
  if (shape.length !== rank) {
    fail(DepthBundleErrorCode.Shape, path, `${rank}-dimensional layout got rank ${shape.length}`);
  }
}

function ceilTo4(value: number): number {
  return Math.ceil(value / 4) * 4;
}

function multiplyAll(values: readonly number[], path: string): number {
  let result = 1;
  for (const value of values) {
    result = safeMultiply(result, value, path);
  }
  return result;
}

function readObject(
  value: unknown,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): JsonObject {
  const object = readJsonObject(value, path);
  assertObjectKeys(object, path, requiredKeys, optionalKeys);
  return object;
}

function readJsonObject(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(DepthBundleErrorCode.Manifest, path, 'must be an object');
  }
  return value as JsonObject;
}

function assertObjectKeys(
  object: JsonObject,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): void {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      fail(DepthBundleErrorCode.Manifest, `${path}.${key}`, 'is not allowed by bundle schema v1');
    }
  }
  for (const key of requiredKeys) {
    if (!(key in object)) {
      fail(DepthBundleErrorCode.Manifest, `${path}.${key}`, 'is required');
    }
  }
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(DepthBundleErrorCode.Manifest, path, 'must be an array');
  }
  if (value.length > MAX_COLLECTION_LENGTH) {
    fail(
      DepthBundleErrorCode.Bounds,
      path,
      `contains ${value.length} entries; maximum is ${MAX_COLLECTION_LENGTH}`,
    );
  }
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING_LENGTH) {
    fail(
      DepthBundleErrorCode.Manifest,
      path,
      `must be a non-empty string of at most ${MAX_STRING_LENGTH} characters`,
    );
  }
  return value;
}

function readId(value: unknown, path: string): string {
  const id = readString(value, path);
  if (id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) {
    fail(
      DepthBundleErrorCode.Manifest,
      path,
      `must match ${ID_PATTERN.source} and be at most ${MAX_ID_LENGTH} characters`,
    );
  }
  return id;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(DepthBundleErrorCode.Manifest, path, 'must be a boolean');
  }
  return value;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(DepthBundleErrorCode.Manifest, path, 'must be a finite number');
  }
  return value;
}

function readInteger(value: unknown, path: string): number {
  const number = readFiniteNumber(value, path);
  if (!Number.isSafeInteger(number)) {
    fail(DepthBundleErrorCode.Manifest, path, 'must be a safe integer');
  }
  return number;
}

function readU32(value: unknown, path: string): number {
  const number = readInteger(value, path);
  if (number < 0 || number > U32_MAX) {
    fail(DepthBundleErrorCode.Bounds, path, `must be between 0 and ${U32_MAX}`);
  }
  return number;
}

function readPositiveU32(value: unknown, path: string): number {
  const number = readU32(value, path);
  if (number === 0) {
    fail(DepthBundleErrorCode.Bounds, path, 'must be positive');
  }
  return number;
}

function readLiteral<const T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) {
    fail(DepthBundleErrorCode.Manifest, path, `expected ${JSON.stringify(expected)}`);
  }
  return expected;
}

function readEnum<const T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail(
      DepthBundleErrorCode.InvalidEnum,
      path,
      `expected one of ${values.map((entry) => JSON.stringify(entry)).join(', ')}, got ${JSON.stringify(value)}`,
    );
  }
  return value as T;
}

function readShape(value: unknown, path: string): DepthShape {
  const array = readArray(value, path);
  if (array.length === 0 || array.length > MAX_SHAPE_RANK) {
    fail(DepthBundleErrorCode.Shape, path, `rank must be between 1 and ${MAX_SHAPE_RANK}`);
  }
  return array.map((dimension, index) => {
    const parsed = readPositiveU32(dimension, `${path}[${index}]`);
    if (parsed > 0x0100_0000) {
      fail(DepthBundleErrorCode.Shape, `${path}[${index}]`, 'dimension is unreasonably large');
    }
    return parsed;
  });
}

function readFiniteTuple3(value: unknown, path: string): readonly [number, number, number] {
  const array = readArray(value, path);
  if (array.length !== 3) {
    fail(DepthBundleErrorCode.Manifest, path, `expected 3 entries, got ${array.length}`);
  }
  return [
    readFiniteNumber(array[0], `${path}[0]`),
    readFiniteNumber(array[1], `${path}[1]`),
    readFiniteNumber(array[2], `${path}[2]`),
  ];
}

function readPositiveSize2(value: unknown, path: string): readonly [number, number] {
  const array = readArray(value, path);
  if (array.length !== 2) {
    fail(DepthBundleErrorCode.Manifest, path, `expected 2 entries, got ${array.length}`);
  }
  return [readPositiveU32(array[0], `${path}[0]`), readPositiveU32(array[1], `${path}[1]`)];
}

function readPadding4(value: unknown, path: string): readonly [number, number, number, number] {
  const array = readArray(value, path);
  if (array.length !== 4) {
    fail(DepthBundleErrorCode.Manifest, path, `expected 4 entries, got ${array.length}`);
  }
  return [
    readU32(array[0], `${path}[0]`),
    readU32(array[1], `${path}[1]`),
    readU32(array[2], `${path}[2]`),
    readU32(array[3], `${path}[3]`),
  ];
}

function readWorkgroups(value: unknown, path: string): readonly [number, number, number] {
  const array = readArray(value, path);
  if (array.length !== 3) {
    fail(DepthBundleErrorCode.Manifest, path, `expected 3 entries, got ${array.length}`);
  }
  const result = [
    readPositiveU32(array[0], `${path}[0]`),
    readPositiveU32(array[1], `${path}[1]`),
    readPositiveU32(array[2], `${path}[2]`),
  ] as const;
  for (const [index, count] of result.entries()) {
    if (count > MAX_WORKGROUPS_PER_DIMENSION) {
      fail(
        DepthBundleErrorCode.Bounds,
        `${path}[${index}]`,
        `exceeds WebGPU's portable limit ${MAX_WORKGROUPS_PER_DIMENSION}`,
      );
    }
  }
  return result;
}

function readTensorIds(
  value: unknown,
  path: string,
  tensorById: ReadonlyMap<string, DepthTensor>,
): string[] {
  return readArray(value, path).map((idValue, index) => {
    const id = readId(idValue, `${path}[${index}]`);
    requireTensor(tensorById, id, `${path}[${index}]`);
    return id;
  });
}

function requireTensor(
  tensorById: ReadonlyMap<string, DepthTensor>,
  tensorId: string,
  path: string,
): DepthTensor {
  const tensor = tensorById.get(tensorId);
  if (tensor === undefined) {
    fail(DepthBundleErrorCode.Reference, path, `unknown tensor ${JSON.stringify(tensorId)}`);
  }
  return tensor;
}

function toUniqueMap<T extends { readonly id: string }>(
  entries: readonly T[],
  path: string,
): Map<string, T> {
  const map = new Map<string, T>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    if (map.has(entry.id)) {
      fail(
        DepthBundleErrorCode.DuplicateId,
        `${path}[${index}].id`,
        `duplicate id ${JSON.stringify(entry.id)}`,
      );
    }
    map.set(entry.id, entry);
  }
  return map;
}

function assertUniqueStrings(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined && seen.has(value)) {
      fail(
        DepthBundleErrorCode.DuplicateId,
        `${path}[${index}]`,
        `duplicate value ${JSON.stringify(value)}`,
      );
    }
    if (value !== undefined) {
      seen.add(value);
    }
  }
}

function shapeElementCount(shape: DepthShape, path: string): number {
  let count = 1;
  for (const dimension of shape) {
    count = safeMultiply(count, dimension, path);
  }
  return count;
}

function assertExactShape(actual: DepthShape, expected: readonly number[], path: string): void {
  if (
    actual.length !== expected.length ||
    actual.some((dimension, index) => dimension !== expected[index])
  ) {
    fail(
      DepthBundleErrorCode.Shape,
      path,
      `expected logical shape [${expected.join(', ')}], got [${actual.join(', ')}]`,
    );
  }
}

function assertRange(offset: number, length: number, limit: number, path: string): void {
  if (offset > limit || length > limit - offset) {
    fail(
      DepthBundleErrorCode.Bounds,
      path,
      `range [${offset}, ${offset + length}) exceeds ${limit} bytes`,
    );
  }
}

function safeAdd(left: number, right: number, path: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result > U32_MAX) {
    fail(DepthBundleErrorCode.Bounds, path, `${left} + ${right} overflows uint32`);
  }
  return result;
}

function safeMultiply(left: number, right: number, path: string): number {
  if (left !== 0 && right > U32_MAX / left) {
    fail(DepthBundleErrorCode.Shape, path, `${left} * ${right} overflows uint32 byte accounting`);
  }
  return left * right;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function crc32Range(bytes: Uint8Array, zeroStart = -1, zeroEnd = -1): number {
  let checksum = 0xffff_ffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = index >= zeroStart && index < zeroEnd ? 0 : (bytes[index] ?? 0);
    const tableIndex = (checksum ^ byte) & 0xff;
    checksum = (crc32Table[tableIndex] ?? 0) ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffff_ffff) >>> 0;
}

function hex32(value: number): string {
  return value.toString(16).padStart(8, '0');
}

function fail(code: DepthBundleErrorCode, path: string, message: string): never {
  throw new DepthBundleError(code, path, message);
}
