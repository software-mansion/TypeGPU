import tgpu, { d, std, type TgpuRoot } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import { loadModel, modelVertexLayout } from './load-model.ts';
import { fullScreenTriangle } from 'typegpu/common';
import { postProcessLayout, ScreenTextures } from './screen-textures.ts';
import { Pattern } from './pattern.ts';
import { createFluidSim, renderFluidSimLayout, SIM_N } from './fluid-sim.ts';

interface HeroEffectOptions {
  root: TgpuRoot;
  context: GPUCanvasContext;
}

const Uniforms = d.struct({
  viewProjection: d.mat4x4f,
  modelMatrix: d.mat4x4f,
});

export async function initHeroEffect(options: HeroEffectOptions) {
  const { root, context } = options;
  const canvas = context.canvas as HTMLCanvasElement;
  const model = await loadModel(root);
  const fluidSim = createFluidSim(root, canvas);
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const resolution = [canvas.width, canvas.height] as [number, number];
  const screenTextures = new ScreenTextures(root, resolution);

  function onResize(width: number, height: number) {
    resolution[0] = width;
    resolution[1] = height;
    screenTextures.resolution = resolution;
  }

  const uniforms = root.createUniform(Uniforms);
  const time = root.createUniform(d.f32);
  const pattern = new Pattern(root);
  const fsampler = root.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });

  const vertexFn = tgpu.vertexFn({
    in: { pos: d.vec3f, normal: d.vec3f, vid: d.builtin.vertexIndex },
    out: { localPos: d.vec3f, position: d.builtin.position, normal: d.vec3f },
  })((input) => {
    const position = uniforms.$.viewProjection
      .mul(uniforms.$.modelMatrix)
      .mul(d.vec4f(input.pos, 1));

    return {
      position,
      localPos: input.pos,
      normal: input.normal,
    };
  });

  const fragmentFn = tgpu.fragmentFn({
    in: { localPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    const negLight = std.saturate(d.vec3f(0.2, 1, 0.1));
    const att = std.dot(input.normal, negLight) * 0.5;
    const ambient = d.vec3f(0.1, 0.1, 0.15);
    const diffuse = d.vec3f(0.8, 0.6, 0.9);
    return d.vec4f(std.saturate(diffuse.mul(att).add(ambient)), 1);
  });

  const renderPipeline = root.createRenderPipeline({
    attribs: modelVertexLayout.attrib,
    vertex: vertexFn,
    fragment: fragmentFn,
    targets: { format: presentationFormat },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  const CirclePattern = d.struct({
    color: d.vec4f,
    dist: d.f32,
  });

  const circlePattern = (rot: d.m2x2f, irot: d.m2x2f, uv: d.v2f, scale: number, offset: number) => {
    'use gpu';

    let coord = irot
      .mul(std.floor(rot.mul(uv.mul(scale).add(offset))).add(0.5))
      .sub(offset)
      .div(scale);
    const color = std.textureSample(postProcessLayout.$.inTexture, fsampler.$, coord);

    // const ruv = std.fract(uv.mul(scale));
    // const dist = std.length(ruv.sub(d.vec2f(0.5)));
    const dist = std.distance(uv, coord) * scale;
    return CirclePattern({ color, dist });
  };

  const ss = (pat: d.Infer<typeof CirclePattern>, sharpness: number, bias: d.v4f) => {
    'use gpu';
    return d.vec4f(
      std.smoothstep(0, sharpness, pat.dist + pat.color.x - bias.x),
      std.smoothstep(0, sharpness, pat.dist + pat.color.y - bias.y),
      std.smoothstep(0, sharpness, pat.dist + pat.color.z - bias.z),
      std.smoothstep(0, sharpness, -pat.dist + pat.color.w - bias.w),
    );
  };

  const sampleInk = (uv: d.v2f) => {
    'use gpu';
    return std.textureSample(renderFluidSimLayout.$.inkTexture, fsampler.$, uv).x;
  };

  const postProcessFragmentFn = tgpu.fragmentFn({
    in: { pixelCoord: d.builtin.position, uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    const pixelStep = d.f32(1) / SIM_N;

    const inkUv = d.vec2f(input.uv.x, 1 - input.uv.y);
    const leftSample = sampleInk(d.vec2f(inkUv.x - pixelStep, inkUv.y));
    const rightSample = sampleInk(d.vec2f(inkUv.x + pixelStep, inkUv.y));
    const upSample = sampleInk(d.vec2f(inkUv.x, inkUv.y + pixelStep));
    const downSample = sampleInk(d.vec2f(inkUv.x, inkUv.y - pixelStep));
    const grad = d.vec2f(rightSample - leftSample, upSample - downSample);

    const identity = d.mat2x2f(d.vec2f(1, 0), d.vec2f(0, 1));
    const rot = d.mat2x2f(std.normalize(d.vec2f(1, 1)), std.normalize(d.vec2f(-1, 1)));
    const irot = d.mat2x2f(std.normalize(d.vec2f(1, -1)), std.normalize(d.vec2f(1, 1)));
    const pat1 = circlePattern(
      identity,
      identity,
      input.uv.add(grad.mul(3)),
      // input.uv,
      d.f32(3),
      d.f32(0),
    );
    const pat2 = circlePattern(
      rot,
      irot,
      // input.uv,
      input.uv.add(grad.mul(0.02)),
      d.f32(80),
      d.f32(0),
    );

    const tint = d.vec3f(0.9, 0.5, 1);
    const c2 = ss(
      pat2,
      0.1,
      d.vec4f(
        0.5 + pat1.dist * 0.4 + downSample * 0.5,
        0.5 + pat1.dist * 0.4 + downSample * 0.5,
        0.5 + pat1.dist * 0.4,
        0.5 + pat1.dist * 0.4 - downSample * 0.3,
      ),
    );

    const grayscale = d.vec4f(d.vec3f(c2.x + c2.y + c2.z + 0.8).mul(tint), 1).mul(0.5 * c2.w);

    return std.mix(grayscale, c2, std.smoothstep(0, 0.2, downSample));
    // return d.vec4f(c1.mul(c2).xyz, std.saturate(c1.w + c2.w));
  });

  const postProcessPipeline = root.createRenderPipeline({
    vertex: fullScreenTriangle,

    fragment: postProcessFragmentFn,
    targets: { format: presentationFormat },
  });

  let running = true;
  const frame = (timestamp: number) => {
    if (!running) {
      return;
    }
    requestAnimationFrame(frame);

    if (resolution[0] !== canvas.width || resolution[1] !== canvas.height) {
      onResize(canvas.width, canvas.height);
    }

    fluidSim.update();
    time.write((timestamp * 0.0002) % 1000);

    const viewProjection = mat4.perspective(
      0.5,
      resolution[0] / resolution[1],
      0.1,
      1000,
      d.mat4x4f(),
    );

    const modelMatrix = mat4.identity(d.mat4x4f());
    mat4.translate(modelMatrix, [0, -0.7, -10], modelMatrix);

    mat4.rotateZ(modelMatrix, -0.1, modelMatrix);
    mat4.rotateX(modelMatrix, 0.6, modelMatrix);

    // Rotating around local y-axis
    mat4.rotateY(modelMatrix, -timestamp * 0.00015, modelMatrix);

    uniforms.write({
      viewProjection,
      modelMatrix,
    });

    const depthView = screenTextures.depthTexture.createView('render');
    const modelRenderView = screenTextures.modelTexture.createView('render');
    const canvasView = context.getCurrentTexture().createView();

    renderPipeline
      .withIndexBuffer(model.body.indexBuffer)
      .with(modelVertexLayout, model.body.vertexBuffer)
      .withColorAttachment({
        view: modelRenderView,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .drawIndexed(model.body.indexCount);

    renderPipeline
      .withIndexBuffer(model.tail.indexBuffer)
      .with(modelVertexLayout, model.tail.vertexBuffer)
      .withColorAttachment({
        view: modelRenderView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .drawIndexed(model.tail.indexCount);

    // Post-processing
    postProcessPipeline
      .with(screenTextures.postProcessGroup)
      .with(fluidSim.renderBindGroup)
      .withColorAttachment({
        view: canvasView,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .draw(3);
  };

  requestAnimationFrame(frame);

  return {
    onCleanup() {
      running = false;
    },
  };
}
