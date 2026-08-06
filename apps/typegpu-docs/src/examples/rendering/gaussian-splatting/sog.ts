import { tgpu, d, std, type StorageFlag, type TgpuBuffer, type TgpuRoot } from 'typegpu';

const ASSET_BASE = '/TypeGPU/assets/gaussian-splatting';

const SH_C0 = 0.28209479177387814;
const DECODE_WORKGROUP_SIZE = 256;

export interface SogMeta {
  version: number;
  count: number;
  means: { mins: number[]; maxs: number[]; files: string[] };
  scales: { codebook: number[]; files: string[] };
  quats: { files: string[] };
  sh0: { codebook: number[]; files: string[] };
}

export interface SogScene {
  meta: SogMeta;
  width: number;
  height: number;
  images: {
    meansL: ImageBitmap;
    meansU: ImageBitmap;
    quats: ImageBitmap;
    scales: ImageBitmap;
    sh0: ImageBitmap;
  };
}

async function fetchBlob(url: string, onChunk: (bytes: number) => void): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  const reader = response.body.getReader();
  const parts: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
    onChunk(value.byteLength);
  }
  return new Blob(parts);
}

async function fetchImage(url: string, onChunk: (bytes: number) => void): Promise<ImageBitmap> {
  const blob = await fetchBlob(url, onChunk);
  return createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
}

/** Downloads a SOG v2 scene bundle (meta.json + attribute WebP images) */
export async function loadSogScene(onProgress: (message: string) => void): Promise<SogScene> {
  onProgress('Downloading scene metadata...');
  const metaResponse = await fetch(`${ASSET_BASE}/meta.json`);
  if (!metaResponse.ok) {
    throw new Error(`Failed to fetch scene metadata (${metaResponse.status})`);
  }
  const meta = (await metaResponse.json()) as SogMeta;

  let downloadedBytes = 0;
  const onChunk = (bytes: number) => {
    downloadedBytes += bytes;
    onProgress(`Downloading splat data... ${(downloadedBytes / 1e6).toFixed(0)} MB`);
  };

  const fetchNamed = (name: string) => fetchImage(`${ASSET_BASE}/${name}`, onChunk);

  const [meansL, meansU, quats, scales, sh0] = await Promise.all([
    fetchNamed(meta.means.files[0]),
    fetchNamed(meta.means.files[1]),
    fetchNamed(meta.quats.files[0]),
    fetchNamed(meta.scales.files[0]),
    fetchNamed(meta.sh0.files[0]),
  ]);

  return {
    meta,
    width: meansL.width,
    height: meansL.height,
    images: { meansL, meansU, quats, scales, sh0 },
  };
}

export type PosColorBuffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
export type RotScaleBuffer = TgpuBuffer<d.WgslArray<d.Vec2u>> & StorageFlag;

const DecodeParams = d.struct({
  mins: d.vec3f,
  maxs: d.vec3f,
  stride: d.f32,
  srcMax: d.u32,
  dstCount: d.u32,
});

const decodeLayout = tgpu.bindGroupLayout({
  meansL: { texture: d.texture2d(d.f32) },
  meansU: { texture: d.texture2d(d.f32) },
  quats: { texture: d.texture2d(d.f32) },
  scales: { texture: d.texture2d(d.f32) },
  sh0: { texture: d.texture2d(d.f32) },
  sh0Codebook: { storage: d.arrayOf(d.f32), access: 'readonly' },
  posColor: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
  rotScale: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
});

/** Creates a reusable GPU decoder that unpacks a SOG scene into compact per-splat buffers */
export function createSogDecoder(root: TgpuRoot) {
  const params = root.createUniform(DecodeParams);

  const decodeKernel = tgpu.computeFn({
    workgroupSize: [DECODE_WORKGROUP_SIZE],
    in: { gid: d.builtin.globalInvocationId },
  })((input) => {
    'use gpu';
    const idx = input.gid.x;
    if (idx >= params.$.dstCount) {
      return;
    }

    const srcIdx = std.min(d.u32(d.f32(idx) * params.$.stride), params.$.srcMax);
    const texWidth = std.textureDimensions(decodeLayout.$.meansL).x;
    const row = d.u32(std.floor(d.f32(srcIdx) / d.f32(texWidth)));
    const col = srcIdx - row * texWidth;
    const uv = d.vec2i(d.i32(col), d.i32(row));

    const low = std.textureLoad(decodeLayout.$.meansL, uv, 0).xyz;
    const high = std.textureLoad(decodeLayout.$.meansU, uv, 0).xyz;
    const normalized = (low + high * 256) / 257;
    const logPos = std.mix(d.vec3f(params.$.mins), d.vec3f(params.$.maxs), normalized);
    const pos = std.sign(logPos) * (std.exp(std.abs(logPos)) - 1);

    const sh = std.textureLoad(decodeLayout.$.sh0, uv, 0);
    const shR = decodeLayout.$.sh0Codebook[d.u32(sh.x * 255 + 0.5)];
    const shG = decodeLayout.$.sh0Codebook[d.u32(sh.y * 255 + 0.5)];
    const shB = decodeLayout.$.sh0Codebook[d.u32(sh.z * 255 + 0.5)];
    const rgb = std.clamp(d.vec3f(shR, shG, shB) * SH_C0 + 0.5, d.vec3f(), d.vec3f(1));
    const color = std.pack4x8unorm(d.vec4f(rgb, sh.w));

    const quat = std.pack4x8unorm(std.textureLoad(decodeLayout.$.quats, uv, 0));
    const scale = std.textureLoad(decodeLayout.$.scales, uv, 0);
    const scaleIdx =
      d.u32(scale.x * 255 + 0.5) |
      (d.u32(scale.y * 255 + 0.5) << 8) |
      (d.u32(scale.z * 255 + 0.5) << 16);

    decodeLayout.$.posColor[idx] = d.vec4f(pos, std.bitcast(d.u32, d.f32)(color));
    decodeLayout.$.rotScale[idx] = d.vec2u(quat, scaleIdx);
  });

  const pipeline = root.createComputePipeline({ compute: decodeKernel });
  const sh0Codebook = root.createBuffer(d.arrayOf(d.f32, 256)).$usage('storage');

  return {
    decode(scene: SogScene, count: number, posColor: PosColorBuffer, rotScale: RotScaleBuffer) {
      const { meta, width, height, images } = scene;

      sh0Codebook.write(meta.sh0.codebook);
      params.write({
        mins: d.vec3f(...(meta.means.mins as [number, number, number])),
        maxs: d.vec3f(...(meta.means.maxs as [number, number, number])),
        stride: meta.count / count,
        srcMax: meta.count - 1,
        dstCount: count,
      });

      const uploadTexture = (bitmap: ImageBitmap) => {
        const texture = root
          .createTexture({ size: [width, height], format: 'rgba8unorm' })
          .$usage('sampled', 'render');
        root.device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture: root.unwrap(texture) },
          [width, height],
        );
        return texture;
      };

      const textures = [
        uploadTexture(images.meansL),
        uploadTexture(images.meansU),
        uploadTexture(images.quats),
        uploadTexture(images.scales),
        uploadTexture(images.sh0),
      ];

      const bindGroup = root.createBindGroup(decodeLayout, {
        meansL: textures[0],
        meansU: textures[1],
        quats: textures[2],
        scales: textures[3],
        sh0: textures[4],
        sh0Codebook,
        posColor,
        rotScale,
      });

      pipeline.with(bindGroup).dispatchWorkgroups(Math.ceil(count / DECODE_WORKGROUP_SIZE));

      for (const texture of textures) {
        root.unwrap(texture).destroy();
      }
    },

    destroy() {
      sh0Codebook.destroy();
    },
  };
}
