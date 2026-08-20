import type { DepthBundle, DepthOutputPolarity, DepthWeightSection } from './types.ts';

export * from './types.ts';

const BUNDLE_MAGIC = 'DARTBND\0';
const BUNDLE_VERSION = 1;
const HEADER_BYTES = 48;
const PAYLOAD_ALIGNMENT = 256;

type Manifest = Omit<
  DepthBundle,
  'output' | 'tensorById' | 'weightSections' | 'weightSectionById' | 'payload'
> & {
  readonly output: Omit<DepthBundle['output'], 'polarity'> & {
    readonly polarity?: DepthOutputPolarity;
  };
  readonly weightSections: readonly Omit<DepthWeightSection, 'bytes'>[];
};

/** Parses a DepthART bundle, trusting everything past the magic and version */
export function parseDepthBundle(buffer: ArrayBuffer): DepthBundle {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magicMatches =
    bytes.byteLength >= HEADER_BYTES &&
    [...BUNDLE_MAGIC].every((char, index) => bytes[index] === char.charCodeAt(0));
  if (!magicMatches || view.getUint32(8, true) !== BUNDLE_VERSION) {
    throw new Error('Not a DepthART v1 bundle.');
  }

  const manifestByteLength = view.getUint32(24, true);
  const manifest = JSON.parse(
    new TextDecoder().decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + manifestByteLength)),
  ) as Manifest;

  const payloadByteOffset =
    Math.ceil((HEADER_BYTES + manifestByteLength) / PAYLOAD_ALIGNMENT) * PAYLOAD_ALIGNMENT;
  const payload = bytes.subarray(payloadByteOffset);
  const weightSections = manifest.weightSections.map((section) => ({
    ...section,
    bytes: payload.subarray(section.byteOffset, section.byteOffset + section.byteLength),
  }));

  return {
    ...manifest,
    output: { ...manifest.output, polarity: manifest.output.polarity ?? 'direct' },
    tensorById: new Map(manifest.tensors.map((tensor) => [tensor.id, tensor])),
    weightSections,
    weightSectionById: new Map(weightSections.map((section) => [section.id, section])),
    payload,
  };
}
