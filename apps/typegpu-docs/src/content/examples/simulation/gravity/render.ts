import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';
import {
  VertexOutput,
  celestialBodiesBindGroupLayout as celestialBodiesLayout,
  renderBindGroupLayout as renderLayout,
  textureBindGroupLayout as textureLayout,
} from './schemas.ts';

export const skyBoxVertex = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec4f,
    uv: d.vec2f,
  },
  out: {
    pos: d.builtin.position,
    texCoord: d.vec3f,
  },
})((input) => {
  const viewRotationMatrix = d.mat4x4f(
    renderLayout.$.camera.view.columns[0],
    renderLayout.$.camera.view.columns[1],
    renderLayout.$.camera.view.columns[2],
    d.vec4f(0, 0, 0, 1),
  );
  return {
    pos: std.mul(
      renderLayout.$.camera.projection,
      std.mul(viewRotationMatrix, input.position),
    ),
    texCoord: input.position.xyz,
  };
});

export const skyBoxFragment = tgpu['~unstable'].fragmentFn({
  in: {
    texCoord: d.vec3f,
  },
  out: d.vec4f,
})((input) => {
  return std.textureSample(
    textureLayout.$.skyBox,
    textureLayout.$.sampler,
    std.normalize(input.texCoord),
  );
});

export const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec4f,
      normal: d.vec3f,
      uv: d.vec2f,
      instanceIdx: d.builtin.instanceIndex,
    },
    out: VertexOutput,
  })((input) => {
    const camera = renderLayout.$.camera;
    const object = celestialBodiesLayout.$.inState[input.instanceIdx];
    const worldPosition = std.add(
      std.mul(object.modelTransformationMatrix, input.position),
      d.vec4f(object.position, 1),
    );
    const relativeToCamera = std.mul(camera.view, worldPosition);
    return {
      position: std.mul(camera.projection, relativeToCamera),
      uv: input.uv,
      normals: input.normal,
      worldPosition: worldPosition.xyz,
    };
  })
  .$name('mainVertex');

export const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.vec4f,
  })((input) => {
    //const textureColorWithAlpha = sampleTexture({ uv: input.textureUV }); // base color
    const textureColor = d.vec3f(0.6, 0.3, 0.5); //textureColorWithAlpha.xyz;
    const normal = input.normals;

    const ambient = std.mul(0.5, std.mul(textureColor, p.lightColor));

    const cosTheta = std.dot(normal, p.lightDirection);
    const diffuse = std.mul(
      std.max(0, cosTheta),
      std.mul(textureColor, p.lightColor),
    );

    const viewSource = std.normalize(
      std.sub(renderLayout.$.camera.position.xyz, input.worldPosition),
    );
    const reflectSource = std.normalize(
      std.reflect(std.mul(-1, p.lightDirection), normal),
    );
    const specularStrength = std.pow(
      std.max(0, std.dot(viewSource, reflectSource)),
      16,
    );
    const specular = std.mul(specularStrength, p.lightColor);

    const lightedColor = std.add(ambient, std.add(diffuse, specular));

    return d.vec4f(lightedColor.xyz, 1);
  })
  .$name('mainFragment');

// const sampleTexture = tgpu['~unstable']
//   .fn([d.vec2f], d.vec4f)
//   .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
//         return textureSample(EXT.texture, EXT.sampler, uv);
//     }`)
//   .$uses({ EXT })
//   .$name('sampleShader');
