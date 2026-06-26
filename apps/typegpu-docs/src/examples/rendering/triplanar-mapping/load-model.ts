import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { common, type TgpuRoot } from 'typegpu';
import { modelVertexLayout } from './schemas.ts';

type MeshAttribute = {
  value: Float32Array;
};

type LoadedObj = {
  attributes: {
    POSITION?: MeshAttribute;
    NORMAL?: MeshAttribute;
    TEXCOORD_0?: MeshAttribute;
  };
};

function computeTangents(position: Float32Array, normal: Float32Array, uv: Float32Array) {
  const vertexCount = position.length / 3;
  const tangent = new Float32Array(vertexCount * 4);
  const tangentSum = new Float32Array(vertexCount * 3);
  const bitangentSum = new Float32Array(vertexCount * 3);

  for (let i = 0; i + 2 < vertexCount; i += 3) {
    const p0 = i * 3;
    const p1 = p0 + 3;
    const p2 = p0 + 6;

    const e1x = position[p1] - position[p0];
    const e1y = position[p1 + 1] - position[p0 + 1];
    const e1z = position[p1 + 2] - position[p0 + 2];
    const e2x = position[p2] - position[p0];
    const e2y = position[p2 + 1] - position[p0 + 1];
    const e2z = position[p2 + 2] - position[p0 + 2];

    const uv0 = i * 2;
    const uv1 = uv0 + 2;
    const uv2 = uv0 + 4;
    const du1 = uv[uv1] - uv[uv0];
    const dv1 = uv[uv0 + 1] - uv[uv1 + 1];
    const du2 = uv[uv2] - uv[uv0];
    const dv2 = uv[uv0 + 1] - uv[uv2 + 1];
    const det = du1 * dv2 - du2 * dv1;

    if (Math.abs(det) < 1e-8) {
      continue;
    }

    const r = 1 / det;
    const tx = (e1x * dv2 - e2x * dv1) * r;
    const ty = (e1y * dv2 - e2y * dv1) * r;
    const tz = (e1z * dv2 - e2z * dv1) * r;
    const bx = (e2x * du1 - e1x * du2) * r;
    const by = (e2y * du1 - e1y * du2) * r;
    const bz = (e2z * du1 - e1z * du2) * r;

    for (let j = p0; j <= p2; j += 3) {
      tangentSum[j] += tx;
      tangentSum[j + 1] += ty;
      tangentSum[j + 2] += tz;
      bitangentSum[j] += bx;
      bitangentSum[j + 1] += by;
      bitangentSum[j + 2] += bz;
    }
  }

  for (let i = 0; i < vertexCount; i++) {
    const v = i * 3;
    const nLen = Math.hypot(normal[v], normal[v + 1], normal[v + 2]) || 1;
    const nx = normal[v] / nLen;
    const ny = normal[v + 1] / nLen;
    const nz = normal[v + 2] / nLen;

    const tDotN = tangentSum[v] * nx + tangentSum[v + 1] * ny + tangentSum[v + 2] * nz;
    let tx = tangentSum[v] - nx * tDotN;
    let ty = tangentSum[v + 1] - ny * tDotN;
    let tz = tangentSum[v + 2] - nz * tDotN;
    const tLen = Math.hypot(tx, ty, tz);

    if (tLen > 1e-8) {
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
    } else {
      tx = Math.abs(ny) < 0.999 ? nz : 0;
      ty = 0;
      tz = Math.abs(ny) < 0.999 ? -nx : 1;
      const fallbackLen = Math.hypot(tx, ty, tz) || 1;
      tx /= fallbackLen;
      ty /= fallbackLen;
      tz /= fallbackLen;
    }

    const cx = ny * tz - nz * ty;
    const cy = nz * tx - nx * tz;
    const cz = nx * ty - ny * tx;
    const handedness =
      cx * bitangentSum[v] + cy * bitangentSum[v + 1] + cz * bitangentSum[v + 2] < 0 ? -1 : 1;

    const out = i * 4;
    tangent[out] = tx;
    tangent[out + 1] = ty;
    tangent[out + 2] = tz;
    tangent[out + 3] = handedness;
  }

  return tangent;
}

export async function loadModel(root: TgpuRoot, modelPath: string) {
  const mesh = (await load(modelPath, OBJLoader)) as LoadedObj;
  const position = mesh.attributes.POSITION?.value;
  const normal = mesh.attributes.NORMAL?.value;

  if (!position || !normal) {
    throw new Error(`Model "${modelPath}" must contain positions and normals.`);
  }

  if (position.length !== normal.length) {
    throw new Error(`Model "${modelPath}" has mismatched position and normal counts.`);
  }

  const vertexCount = position.length / 3;
  const uv = mesh.attributes.TEXCOORD_0?.value ?? new Float32Array(vertexCount * 2);
  const tangent = computeTangents(position, normal, uv);

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(vertexCount))
    .$usage('vertex')
    .$name(`vertices for ${modelPath}`);

  common.writeSoA(vertexBuffer, { position, normal, uv, tangent });

  return {
    vertexBuffer,
    vertexCount,
  };
}
