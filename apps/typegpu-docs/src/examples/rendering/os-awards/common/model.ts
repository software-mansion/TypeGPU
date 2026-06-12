import { load } from '@loaders.gl/core';
import { GLBLoader } from '@loaders.gl/gltf';
import { common, d, type TgpuRoot } from 'typegpu';

export const ModelVertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});

const TYPED_ARRAYS = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
} as const;

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

interface GLTFTextureInfo {
  index: number;
}

interface GLTFMaterial {
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    baseColorTexture?: GLTFTextureInfo;
    metallicFactor?: number;
    roughnessFactor?: number;
    metallicRoughnessTexture?: GLTFTextureInfo;
  };
}

export async function loadModel(root: TgpuRoot, url: string) {
  const model = await load(url, GLBLoader);
  const { arrayBuffer, byteOffset, byteLength } = model.binChunks[0];
  const binChunk = arrayBuffer.slice(byteOffset, byteOffset + byteLength);
  const { accessors, bufferViews, meshes, materials, textures, images } = model.json;

  const getTypedArray = (idx: number) => {
    const accessor = accessors[idx];
    const view = bufferViews[accessor.bufferView];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const ArrayType = TYPED_ARRAYS[accessor.componentType as keyof typeof TYPED_ARRAYS];
    const byteLength =
      accessor.count * TYPE_COMPONENTS[accessor.type] * ArrayType.BYTES_PER_ELEMENT;
    return new ArrayType(binChunk.slice(offset, offset + byteLength));
  };

  const primitive = meshes[0].primitives[0];
  const positions = getTypedArray(primitive.attributes.POSITION) as Float32Array;
  const uvs = getTypedArray(primitive.attributes.TEXCOORD_0) as Float32Array;
  const indices = getTypedArray(primitive.indices) as Uint16Array | Uint32Array;
  const normals = getTypedArray(primitive.attributes.NORMAL) as Float32Array;
  const vertexCount = positions.length / 3;

  const vertexBuffer = root
    .createBuffer(d.arrayOf(ModelVertex, vertexCount), (buffer) => {
      common.writeSoA(buffer, { position: positions, normal: normals, uv: uvs });
    })
    .$usage('vertex');

  const indexBuffer = root
    .createBuffer(d.arrayOf(d.u32, indices.length), new Uint32Array(indices))
    .$usage('index');

  const material = materials[primitive.material] as GLTFMaterial;
  const pbr = material.pbrMetallicRoughness ?? {};

  const createTextureFromBitmap = (bitmap: ImageBitmap, srgb: boolean) => {
    const mipLevelCount = Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1;
    const texture = root
      .createTexture({
        size: [bitmap.width, bitmap.height],
        format: 'rgba8unorm',
        mipLevelCount,
        ...(srgb ? { viewFormats: ['rgba8unorm-srgb'] } : {}),
      })
      .$usage('sampled', 'render');
    texture.write(bitmap);
    texture.generateMipmaps();
    bitmap.close();
    return texture;
  };

  const createTextureFromPixel = async (pixel: [number, number, number, number], srgb: boolean) => {
    const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(pixel), 1, 1));
    return createTextureFromBitmap(bitmap, srgb);
  };

  const decodeEmbeddedImage = async (textureIndex: number, srgb: boolean) => {
    const image = images[textures[textureIndex].source];
    if (image.bufferView === undefined) {
      throw new Error('Only embedded GLB textures are supported in this example');
    }

    const imageView = bufferViews[image.bufferView];
    const imageBytes = new Uint8Array(binChunk, imageView.byteOffset ?? 0, imageView.byteLength);
    const bitmap = await createImageBitmap(new Blob([imageBytes]));
    return createTextureFromBitmap(bitmap, srgb);
  };

  const baseColorTexture = pbr.baseColorTexture
    ? await decodeEmbeddedImage(pbr.baseColorTexture.index, true)
    : await createTextureFromPixel([255, 255, 255, 255], true);

  // AO is intentionally ignored; glTF roughness/metallic use G/B.
  const metallicRoughnessTexture = pbr.metallicRoughnessTexture
    ? await decodeEmbeddedImage(pbr.metallicRoughnessTexture.index, false)
    : await createTextureFromPixel([255, 255, 255, 255], false);

  const { min, max } = accessors[primitive.attributes.POSITION];
  return {
    vertexBuffer,
    indexBuffer,
    indexCount: indices.length,
    baseColorTexture,
    metallicRoughnessTexture,
    baseColorFactor: d.vec4f(...(pbr.baseColorFactor ?? [1, 1, 1, 1])),
    metallicFactor: pbr.metallicFactor ?? 1,
    roughnessFactor: pbr.roughnessFactor ?? 1,
    boundsMin: d.vec3f(...(min as [number, number, number])),
    boundsMax: d.vec3f(...(max as [number, number, number])),
  };
}
