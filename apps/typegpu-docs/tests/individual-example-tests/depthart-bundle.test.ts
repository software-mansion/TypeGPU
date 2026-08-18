import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEPTH_BUNDLE_CHECKSUM_BYTE_OFFSET,
  DepthBundleErrorCode,
  DepthOp,
  crc32,
  loadDepthBundle,
  parseDepthBundle,
} from '../../src/examples/image-processing/monocular-light-injection/inference/bundle.ts';

function fixture(): ArrayBuffer {
  return Uint8Array.from(
    readFileSync(
      new URL('../../../../tools/depthart/tests/fixtures/depthart-all-ops-v1.bin', import.meta.url),
    ),
  ).buffer;
}

describe('DepthART bundle parser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('implements IEEE CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf4_3926);
  });

  it('parses the deterministic cross-language all-ops fixture without copying payloads', () => {
    const source = fixture();
    const bundle = parseDepthBundle(source);

    expect(bundle.dispatches).toHaveLength(16);
    expect([...new Set(bundle.dispatches.map(({ op }) => op))].toSorted()).toEqual(
      Object.values(DepthOp).toSorted(),
    );
    expect(bundle.payload).toHaveLength(2_880);
    expect(bundle.payload.buffer).toBe(source);
    expect(bundle.weightSections[0]?.bytes.buffer).toBe(source);
  });

  it('checks the whole bundle before trusting its manifest or payload', () => {
    const source = fixture();
    const bytes = new Uint8Array(source);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    expect(() => parseDepthBundle(source)).toThrow(
      expect.objectContaining({ code: DepthBundleErrorCode.Checksum }),
    );

    const truncated = fixture().slice(0, DEPTH_BUNDLE_CHECKSUM_BYTE_OFFSET);
    expect(() => parseDepthBundle(truncated)).toThrow(
      expect.objectContaining({ code: DepthBundleErrorCode.Truncated }),
    );
  });

  it('loads successful responses and reports HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fixture(), { status: 200 })),
    );
    await expect(loadDepthBundle('/depthart.bundle')).resolves.toMatchObject({
      model: 'depthart-relative-l-448',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(loadDepthBundle('/missing.bundle')).rejects.toMatchObject({
      code: DepthBundleErrorCode.Fetch,
    });
  });
});
