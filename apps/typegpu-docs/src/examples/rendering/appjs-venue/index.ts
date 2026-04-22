import tgpu, { common, d, std, type TgpuRoot } from 'typegpu';
import { hexToRgb } from '@typegpu/color';
import { mat4n } from 'wgpu-matrix';

import { modelVertexLayout } from './model-schema.ts';
import { loadTexture, loadTextureArray } from './load-textures.ts';
import { Camera } from './schema';
import { models } from './models.generated';

const MAP_TILE_MODULES = [
  '/TypeGPU/assets/appjs-venue/lunch.png',
  '/TypeGPU/assets/appjs-venue/sponsors-zone.png',
  '/TypeGPU/assets/appjs-venue/conference-stage.png',
  '/TypeGPU/assets/appjs-venue/expo.png',
  '/TypeGPU/assets/appjs-venue/swm.png',
  '/TypeGPU/assets/appjs-venue/check-in.png',
  '/TypeGPU/assets/appjs-venue/bar.png',
  '/TypeGPU/assets/appjs-venue/networking-area.png',
  '/TypeGPU/assets/appjs-venue/coffee-bar.png',
];

const ACCESSORIES_IMAGE = '/TypeGPU/assets/appjs-venue/accessories.png';

const TILE_SIZE = 0.08;
const TILE_ATLAS_RES = 512;

const TileInstance = d.struct({
  offset: d.vec3f,
  angle: d.f32,
  size: d.vec2f,
  tilt: d.f32,
});

const BORDER_COLOR = hexToRgb('#222222');

const backgroundColor = hexToRgb('#E0E7FF');
const borderColor = BORDER_COLOR;

const groundPlanesColorPalette = tgpu.const(d.arrayOf(d.vec3f), [
  hexToRgb('#FFFFFF'),
  hexToRgb('#EEF1FF'),
  hexToRgb('#CCD6FF'),
]);

// layouts

interface Options {
  root: TgpuRoot;
  signal: AbortSignal;
  context: GPUCanvasContext;
}

/**
 * Rotates a 3d vector around the Y axis
 */
function rotateY(v: d.v3f, angle: number) {
  'use gpu';
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec3f(v.x * cos - v.z * sin, v.y, v.x * sin + v.z * cos);
}

/**
 * Rotates a 3d vector around the X axis
 */
function rotateX(v: d.v3f, angle: number) {
  'use gpu';
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec3f(v.x, v.z * sin - v.y * cos, v.z * cos + v.y * sin);
}

/**
 * Like smoothstep, but interpolates linearly between 0 and 1 when `value` is between `a` and `b`
 */
function linstep(a: number, b: number, value: number) {
  'use gpu';
  return std.saturate((value - a) / (b - a));
}

/**
 * Signed distance function for a rounded 2d box
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
const sdRoundedBox2d = (point: d.v2f, size: d.v2f, cornerRadius: number) => {
  'use gpu';
  const dd = std.abs(point).sub(size).add(d.vec2f(cornerRadius));
  return std.length(std.max(dd, d.vec2f(0))) + std.min(std.max(dd.x, dd.y), 0) - cornerRadius;
};

const modelLayout = tgpu.bindGroupLayout({
  opacity: { uniform: d.f32 },
});

async function setup(opts: Options) {
  // setup
  const { root, context, signal } = opts;
  const canvas = context.canvas;

  const baseModel = models['stara-zajezdnia-base'](root);
  const outsideModel = models['stara-zajezdnia-outside'](root);
  const accessoriesModel = models['stara-zajezdnia-accessories'](root);
  const groundplanesModel = models['stara-zajezdnia-groudplanes'](root);
  const guidelinesModel = models['stara-zajezdnia-guidelines'](root);

  const { texture: tileAtlas, aspects: tileAspects } = await loadTextureArray(
    root,
    MAP_TILE_MODULES,
    TILE_ATLAS_RES,
  );

  const accessoriesTexture = await loadTexture(root, ACCESSORIES_IMAGE);
  const accessoriesView = accessoriesTexture.createView(d.texture2d(d.f32));

  const tileAtlasView = tileAtlas.createView(d.texture2dArray(d.f32));

  const fadeIn = root.createUniform(d.f32);
  const insideOpacity = root.createUniform(d.f32, 1);
  const outsideOpacity = root.createUniform(d.f32, 1);

  const outsideGroup = root.createBindGroup(modelLayout, {
    opacity: outsideOpacity.buffer,
  });

  const insideGroup = root.createBindGroup(modelLayout, {
    opacity: insideOpacity.buffer,
  });

  const tileInstances = tgpu.const(d.arrayOf(TileInstance), [
    // LUNCH
    {
      offset: d.vec3f(-0.25, 0.25, 1.65),
      size: d.vec2f(TILE_SIZE * tileAspects[0], TILE_SIZE),
      angle: 0,
      tilt: 0,
    },
    // {
    //   offset: d.vec3f(-0.15, 0.25, 1.65),
    //   size: d.vec2f(TILE_SIZE * tileAspects[0], TILE_SIZE),
    //   angle: -1,
    //   tilt: -Math.PI / 4,
    // },
    // Sponsors' zone
    {
      offset: d.vec3f(-0.29, 0.01, -0.99),
      size: d.vec2f(TILE_SIZE * tileAspects[1], TILE_SIZE),
      angle: 0,
      tilt: 0,
    },
    // Conference stage
    {
      offset: d.vec3f(-0.28, 0.05, -2),
      size: d.vec2f(TILE_SIZE * tileAspects[2] * 3, TILE_SIZE * 3),
      angle: 0,
      tilt: 0,
    },
    // Expo
    {
      offset: d.vec3f(-0.655, 0.18, -0.125),
      size: d.vec2f(TILE_SIZE * tileAspects[3], TILE_SIZE),
      angle: 0,
      tilt: 0,
    },
    // Software Mansion
    {
      offset: d.vec3f(-0.21, 0.18, -0.125),
      size: d.vec2f(TILE_SIZE * tileAspects[4], TILE_SIZE),
      angle: 0,
      tilt: 0,
    },
    // CHECK-IN
    {
      offset: d.vec3f(0.055, 0.01, 0.145),
      size: d.vec2f(TILE_SIZE * tileAspects[5], TILE_SIZE),
      angle: 0,
      tilt: 0,
    },
    // BAR
    {
      offset: d.vec3f(0.5, 0, 0.35),
      size: d.vec2f(TILE_SIZE * tileAspects[6], TILE_SIZE),
      angle: 0,
      tilt: 0,
    },
    // NETWORKING AREA
    {
      offset: d.vec3f(0.41, 0.01, 1.22),
      size: d.vec2f(TILE_SIZE * tileAspects[7] * 3, TILE_SIZE * 3),
      angle: 0,
      tilt: 0,
    },
    // COFFEE BAR
    {
      offset: d.vec3f(0.165, 0.171, -0.27),
      size: d.vec2f(TILE_SIZE * tileAspects[8], TILE_SIZE),
      angle: -Math.PI / 2,
      tilt: 0,
    },
  ]);

  // camera
  const cameraUniform = root.createUniform(Camera);

  const alphaBlend = {
    color: {
      operation: 'add',
      srcFactor: 'src-alpha',
      dstFactor: 'one-minus-src-alpha',
    },
    alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
  } as const;

  // pipelines

  const modelRenderPipeline = ({ getObjColor }: { getObjColor: (uv: d.v2f) => d.v3f }) =>
    root.createRenderPipeline({
      attribs: modelVertexLayout.attrib,
      vertex: ({ position, normal, uv }) => {
        'use gpu';
        const camera = cameraUniform.$;
        const canvasPosition = camera.projection.mul(camera.view).mul(d.vec4f(position, 1));

        return {
          $position: canvasPosition,
          uv,
          worldPosition: position,
          worldNormal: normal,
        };
      },
      fragment: ({ worldPosition, worldNormal, uv, $position }) => {
        'use gpu';
        // Making the opacity never fade down to 0, leaving a faint ghost near the floor.
        const opacity = std.saturate(
          modelLayout.$.opacity + std.saturate(0.3 - worldPosition.y * 1.5),
        );

        return {
          albedo: d.vec4f(getObjColor(uv), opacity),
          normal: d.vec4f(worldNormal, 1).mul(opacity),
          depth: d.vec4f($position.z * 0.001, 0, 0, 1).mul(opacity),
        };
      },
      targets: {
        albedo: {
          format: 'rgba8unorm',
          blend: alphaBlend,
        },
        normal: {
          format: 'rgba16float',
          blend: alphaBlend,
        },
        depth: {
          format: 'r16float',
          blend: alphaBlend,
        },
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
      multisample: {
        count: 4,
      },
      primitive: {
        cullMode: 'back',
      },
    });

  const linearSampler = root.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  });

  const architectureRenderPipeline = modelRenderPipeline({
    getObjColor: (uv) => {
      'use gpu';
      const paletteIdx = -std.floor(uv.y);
      return d.vec3f(groundPlanesColorPalette.$[paletteIdx]);
    },
  });

  const accessoriesRenderPipeline = modelRenderPipeline({
    getObjColor: (uv) => {
      'use gpu';
      return std.textureSample(accessoriesView.$, linearSampler.$, uv).rgb;
    },
  });

  const groundplanesRenderPipeline = root.createRenderPipeline({
    attribs: modelVertexLayout.attrib,
    vertex: ({ position, uv }) => {
      'use gpu';
      const camera = cameraUniform.$;

      return {
        $position: camera.projection.mul(camera.view).mul(d.vec4f(position, 1)),
        uv,
      };
    },
    fragment: ({ uv }) => {
      'use gpu';
      const paletteIdx = -std.floor(uv.y);
      const fuv = std.fract(uv);
      const dist = sdRoundedBox2d(fuv.sub(d.vec2f(1)), d.vec2f(0.75), 0.5);
      const opacity = std.smoothstep(std.fwidth(uv.x), 0, dist);
      return d.vec4f(groundPlanesColorPalette.$[paletteIdx], opacity);
    },
    targets: {
      format: 'rgba8unorm',
      blend: alphaBlend,
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: {
      count: 4,
    },
    primitive: {
      cullMode: 'back',
    },
  });

  const guidelinesRenderPipeline = root.createRenderPipeline({
    attribs: modelVertexLayout.attrib,
    vertex: ({ position, uv }) => {
      'use gpu';
      const camera = cameraUniform.$;

      return {
        $position: camera.projection.mul(camera.view).mul(d.vec4f(position, 1)),
        worldPos: position,
        uv,
      };
    },
    fragment: ({ uv, worldPos }) => {
      'use gpu';
      let opacity = uv.y ** 5 * std.smoothstep(2.2, 2, worldPos.z);
      const pulse = std.sin(timeUniform.$ * 6 + (worldPos.z + worldPos.x) * 20);
      opacity *= 0.8 + pulse * 0.2;

      return {
        normal: std.mix(d.vec4f(0, 1, 0, 0), d.vec4f(1, 0, 0, 1), std.saturate(opacity)),
      };
    },
    targets: {
      normal: {
        format: 'rgba16float',
        blend: alphaBlend,
      },
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: {
      count: 4,
    },
    primitive: {
      // cullMode: "back",
    },
  });

  const postProcessLayout = tgpu.bindGroupLayout({
    albedoMap: { texture: d.texture2d(), sampleType: 'float' },
    normalMap: { texture: d.texture2d(), sampleType: 'float' },
    depthMap: { texture: d.texture2d(), sampleType: 'float' },
  });

  const timeUniform = root.createUniform(d.f32);

  const postProcessPipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv, $position }) => {
      'use gpu';

      const albedo = std.textureLoad(postProcessLayout.$.albedoMap, d.vec2i($position.xy), 0).xyz;
      const normal = std.textureSampleLevel(
        postProcessLayout.$.normalMap,
        linearSampler.$,
        uv,
        1,
      ).xyz;
      const depth = std.textureSampleLevel(postProcessLayout.$.depthMap, linearSampler.$, uv, 1).r;

      const edgeDepth = linstep(0, 50, std.fwidth(depth));
      let edgeNormal = std.fwidth(normal.x) + std.fwidth(normal.y) + std.fwidth(normal.z);
      edgeNormal = linstep(0, 2, edgeNormal);
      const edge = std.saturate(edgeDepth + edgeNormal);

      const opacity = fadeIn.$;
      return d.vec4f(std.mix(albedo, borderColor, edge), opacity);
    },
    targets: {
      blend: alphaBlend,
    },
  });

  // Ground tile rendering
  const groundTileSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const quadCorners = tgpu.const(d.arrayOf(d.vec2f, 6), [
    d.vec2f(-0.5, -0.5),
    d.vec2f(0.5, -0.5),
    d.vec2f(-0.5, 0.5),
    d.vec2f(0.5, -0.5),
    d.vec2f(0.5, 0.5),
    d.vec2f(-0.5, 0.5),
  ]);
  const quadUVs = tgpu.const(d.arrayOf(d.vec2f, 6), [
    d.vec2f(0, 1),
    d.vec2f(1, 1),
    d.vec2f(0, 0),
    d.vec2f(1, 1),
    d.vec2f(1, 0),
    d.vec2f(0, 0),
  ]);

  const GroundVertexOutput = {
    worldPosition: d.vec3f,
    worldNormal: d.vec3f,
    uv: d.vec2f,
    layer: d.interpolate('flat, either', d.u32),
    canvasPosition: d.builtin.position,
  } as const;

  const groundVertex = tgpu.vertexFn({
    in: {
      vertexIndex: d.builtin.vertexIndex,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: GroundVertexOutput,
  })((input) => {
    const uv = quadUVs.$[input.vertexIndex];
    const inst = tileInstances.$[input.instanceIndex];
    const corner2d = quadCorners.$[input.vertexIndex].mul(inst.size);
    const corner3d = d.vec3f(corner2d.x, 0, corner2d.y);
    const rotatedCorner = rotateY(rotateX(corner3d, inst.tilt), inst.angle);
    const worldPos = rotatedCorner.add(inst.offset);
    const camera = cameraUniform.$;
    const canvasPos = camera.projection.mul(camera.view).mul(d.vec4f(worldPos, 1));

    return {
      worldPosition: worldPos,
      worldNormal: d.vec3f(0, 1, 0),
      uv,
      layer: input.instanceIndex,
      canvasPosition: canvasPos,
    };
  });

  const groundFragment = tgpu.fragmentFn({
    in: { ...GroundVertexOutput, position: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    const sampled = std.textureSample(
      tileAtlasView.$,
      groundTileSampler.$,
      input.uv.mul(d.vec2f(1, -1)).add(d.vec2f(0, 1)),
      input.layer,
    );
    // PNGs contain dark text on a transparent background — composite over the
    // scene background color so the text reads against the floor.
    const composited = std.mix(backgroundColor, sampled.xyz, sampled.w);
    if (sampled.w <= 0) {
      std.discard();
    }
    return d.vec4f(composited, sampled.w);
  });

  const groundPipeline = root.createRenderPipeline({
    vertex: groundVertex,
    fragment: groundFragment,
    targets: { format: 'rgba8unorm', blend: alphaBlend },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: {
      count: 4,
    },
  });

  const createAlbedoTexture = ({ sampleCount }: { sampleCount: number }) => {
    return root
      .createTexture({
        size: [canvas.width, canvas.height, 1],
        format: 'rgba8unorm',
        sampleCount,
      })
      .$usage('render', 'sampled');
  };

  const createNormalTexture = ({ sampleCount }: { sampleCount: number }) => {
    return root
      .createTexture({
        size: [canvas.width, canvas.height, 1],
        format: 'rgba16float',
        sampleCount,
        mipLevelCount: sampleCount === 1 ? 2 : 1,
      })
      .$usage('render', 'sampled');
  };

  const createDepthTexture = ({ sampleCount }: { sampleCount: number }) => {
    return root
      .createTexture({
        size: [canvas.width, canvas.height, 1],
        format: 'r16float',
        sampleCount,
        mipLevelCount: sampleCount === 1 ? 2 : 1,
      })
      .$usage('render', 'sampled');
  };

  const createZBuffer = () => {
    return root
      .createTexture({
        size: [canvas.width, canvas.height, 1],
        format: 'depth24plus',
        sampleCount: 4,
      })
      .$usage('render');
  };

  let albedoTexture = createAlbedoTexture({ sampleCount: 1 });
  let normalTexture = createNormalTexture({ sampleCount: 1 });
  let depthTexture = createDepthTexture({ sampleCount: 1 });
  let albedoTextureMSAA = createAlbedoTexture({ sampleCount: 4 });
  let normalTextureMSAA = createNormalTexture({ sampleCount: 4 });
  let depthTextureMSAA = createDepthTexture({ sampleCount: 4 });
  let zBuffer = createZBuffer();
  let postProcessGroup = root.createBindGroup(postProcessLayout, {
    albedoMap: albedoTexture.createView(),
    normalMap: normalTexture.createView(),
    depthMap: depthTexture.createView(),
  });

  const albedoMSAAView = albedoTextureMSAA.createView('render');
  const albedoView = albedoTexture.createView('render');
  const normalMSAAView = normalTextureMSAA.createView('render');
  const normalView = normalTexture.createView('render', { mipLevelCount: 1 });
  const depthMSAAView = depthTextureMSAA.createView('render');
  const depthView = depthTexture.createView('render', { mipLevelCount: 1 });
  const zBufferView = zBuffer.createView('render');

  // frame
  function frame(timestamp: number) {
    const viewMatrix = mat4n.lookAt(
      d.vec3f(0, 2, 1).mul(2),
      d.vec3f(0, 0, 0),
      d.vec3f(0, 1, 0),
      d.mat4x4f(),
    );
    const viewInverseMatrix = mat4n.inverse(viewMatrix, d.mat4x4f());

    cameraUniform.patch({
      projection: mat4n.ortho(-2.2, 2.2, -2.2, 2.2, 0.1, 1000, d.mat4x4f()),
      view: viewMatrix,
      viewInverse: viewInverseMatrix,
    });

    // const viewMatrix = mat4n.lookAt(
    //   d.vec3f(1, 1, 1).mul(3),
    //   d.vec3f(0, 0, 0),
    //   d.vec3f(0, 1, 0),
    //   d.mat4x4f(),
    // );
    // const viewInverseMatrix = mat4n.inverse(viewMatrix, d.mat4x4f());

    // cameraUniform.patch({
    //   projection: mat4n.ortho(-2, 2, -2, 2, 0.1, 1000, d.mat4x4f()),
    //   view: viewMatrix,
    //   viewInverse: viewInverseMatrix,
    // });

    // const viewMatrix = mat4n.lookAt(
    //   d.vec3f(0.8, 1.6, 1).mul(2.7),
    //   d.vec3f(0, 0, 0),
    //   d.vec3f(0, 1, 0),
    //   d.mat4x4f(),
    // );
    // const viewInverseMatrix = mat4n.inverse(viewMatrix, d.mat4x4f());

    // cameraUniform.patch({
    //   projection: mat4n.perspective(
    //     Math.PI / 4,
    //     canvas.width / canvas.height,
    //     0.1,
    //     1000,
    //     d.mat4x4f(),
    //   ),
    //   view: viewMatrix,
    //   viewInverse: viewInverseMatrix,
    // });

    timeUniform.write((timestamp / 1000) % 1000);
    outsideOpacity.write(0);
    fadeIn.write(1);

    architectureRenderPipeline
      .with(insideGroup)
      .withColorAttachment({
        albedo: {
          view: albedoMSAAView,
          clearValue: [backgroundColor.x, backgroundColor.y, backgroundColor.z, 1],
        },
        normal: {
          view: normalMSAAView,
          clearValue: [0, 1, 0, 0],
        },
        depth: {
          view: depthMSAAView,
          clearValue: [100, 0, 0, 0],
        },
      })
      .withDepthStencilAttachment({
        view: zBufferView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .with(modelVertexLayout, baseModel.vertexBuffer)
      .draw(baseModel.polygonCount);

    groundplanesRenderPipeline
      .withColorAttachment({
        view: albedoMSAAView,
        loadOp: 'load',
      })
      .withDepthStencilAttachment({
        view: zBufferView,
        depthClearValue: 1,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(modelVertexLayout, groundplanesModel.vertexBuffer)
      .draw(groundplanesModel.polygonCount);

    guidelinesRenderPipeline
      .withColorAttachment({
        // albedo: {
        //   view: albedoMSAAView,
        //   loadOp: "load",
        // },
        normal: {
          view: normalMSAAView,
          loadOp: 'load',
        },
      })
      .withDepthStencilAttachment({
        view: zBufferView,
        depthClearValue: 1,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(modelVertexLayout, guidelinesModel.vertexBuffer)
      .draw(guidelinesModel.polygonCount);

    groundPipeline
      .withColorAttachment({
        view: albedoMSAAView,
        loadOp: 'load',
      })
      .withDepthStencilAttachment({
        view: zBufferView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .draw(6, tileInstances.$.length);

    accessoriesRenderPipeline
      .with(insideGroup)
      .withColorAttachment({
        albedo: {
          view: albedoMSAAView,
          loadOp: 'load',
        },
        normal: {
          view: normalMSAAView,
          loadOp: 'load',
        },
        depth: {
          view: depthMSAAView,
          loadOp: 'load',
        },
      })
      .withDepthStencilAttachment({
        view: zBufferView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(modelVertexLayout, accessoriesModel.vertexBuffer)
      .draw(accessoriesModel.polygonCount);

    architectureRenderPipeline
      .with(outsideGroup)
      .withColorAttachment({
        albedo: {
          view: albedoMSAAView,
          resolveTarget: albedoView,
          clearValue: [backgroundColor.x, backgroundColor.y, backgroundColor.z, 1],
          loadOp: 'load',
        },
        normal: {
          view: normalMSAAView,
          resolveTarget: normalView,
          clearValue: [0, 0, 0, 0],
          loadOp: 'load',
        },
        depth: {
          view: depthMSAAView,
          resolveTarget: depthView,
          clearValue: [100, 0, 0, 0],
          loadOp: 'load',
        },
      })
      .withDepthStencilAttachment({
        view: zBufferView,
        depthClearValue: 1,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(modelVertexLayout, outsideModel.vertexBuffer)
      .draw(outsideModel.polygonCount);

    normalTexture.generateMipmaps(0, 2);
    depthTexture.generateMipmaps(0, 2);

    postProcessPipeline
      .with(postProcessGroup)
      .withColorAttachment({
        view: context,
      })
      .draw(3);
  }
  requestAnimationFrame(frame);
}

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
canvas.width = 4096 * 2;
canvas.height = 4096 * 2;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const ctrl = new AbortController();

setup({ root, context, signal: ctrl.signal });

export function onCleanup() {
  ctrl.abort();
  root.destroy();
}
