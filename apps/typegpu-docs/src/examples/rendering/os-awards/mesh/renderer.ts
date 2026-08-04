import tgpu, { d, std, type TgpuRoot } from 'typegpu';
import { type loadModel, ModelVertex } from '../common/model.ts';
import {
  isInEpoxyRegion,
  sampleEnv,
  sampleMaterial,
  type SharedBindGroup,
  sharedLayout,
  shadeOpaque,
  tonemapForDisplay,
} from '../common/shading.ts';
import { scene } from '../scene.ts';

const awardVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertex));

const doubleSidedPow = (v: number, factor: number): number => {
  'use gpu';
  return std.sign(v) * std.abs(v) ** factor;
};

const shadeEpoxyApprox = (
  modelPos: d.v3f,
  worldPos: d.v3f,
  normal: d.v3f,
  tangent: d.v3f,
  albedo: d.v3f,
): d.v3f => {
  'use gpu';
  const p = modelPos * scene.epoxy.warp.frequency;
  const warp = d.vec3f(
    std.sin(p.y + p.z * 0.37),
    std.sin(p.z * 1.31 + p.x),
    std.sin(p.x * 0.73 - p.y * 1.19),
  );
  const viewDir = std.normalize(worldPos - sharedLayout.$.camera.position.xyz);

  const viewAlignment = 1 - std.max(0, -std.dot(viewDir, normal)) ** 4;
  const columns = std.mix(
    scene.epoxy.columnDistortion.edgeColumns,
    scene.epoxy.columnDistortion.faceColumns,
    viewAlignment,
  );
  const tan = std.dot(worldPos, tangent);
  const columnDir =
    std.normalize(
      normal +
        viewDir * scene.epoxy.columnDistortion.viewPull +
        tangent *
          (doubleSidedPow(
            std.sin(
              tan *
                scene.epoxy.columnDistortion.waveFrequency *
                columns *
                scene.epoxy.columnDistortion.waveSkew,
            ),
            scene.epoxy.columnDistortion.wavePower,
          ) *
            scene.epoxy.columnDistortion.waveStrength +
            tan),
    ) * -1;

  const distorted = sampleEnv(
    columnDir,
    scene.epoxy.columnDistortion.mipBiasBase +
      viewAlignment * scene.epoxy.columnDistortion.mipBiasAlignmentScale,
  );

  const sceneThrough = distorted * scene.epoxy.tint;
  const woodGrain = std.sin(modelPos.z * 95 + modelPos.y * 48 + warp.x * 1.4) * 0.5 + 0.5;
  const lowerWoodMask = std.saturate(1 - std.smoothstep(-0.145, -0.13, modelPos.y));
  const disturbedWood =
    std.mix(albedo * scene.epoxy.wood.warm, scene.epoxy.wood.dark, 0.72) *
    (0.84 + woodGrain * 0.24);
  const epoxyBody = std.mix(sceneThrough, albedo, scene.epoxy.albedoMix);
  return std.mix(epoxyBody, disturbedWood, lowerWoodMask * 0.65);
};

const awardVertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
  out: {
    pos: d.builtin.position,
    normal: d.vec3f,
    tangent: d.vec3f,
    uv: d.vec2f,
    modelPos: d.vec3f,
    worldPos: d.vec3f,
  },
})((input) => {
  'use gpu';
  const worldPos = sharedLayout.$.awardTransform * d.vec4f(input.position, 1);
  return {
    pos: sharedLayout.$.camera.projection * (sharedLayout.$.camera.view * worldPos),
    normal: (sharedLayout.$.awardTransform * d.vec4f(input.normal, 0)).xyz,
    tangent: (sharedLayout.$.awardTransform * d.vec4f(d.vec3f(1, 0, 0), 0)).xyz,
    uv: input.uv,
    modelPos: input.position,
    worldPos: worldPos.xyz,
  };
});

const awardFragment = tgpu.fragmentFn({
  in: {
    normal: d.vec3f,
    tangent: d.vec3f,
    uv: d.vec2f,
    modelPos: d.vec3f,
    worldPos: d.vec3f,
    frontFacing: d.builtin.frontFacing,
  },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const normal = std.normalize(std.select(std.neg(input.normal), input.normal, input.frontFacing));
  const tangent = std.normalize(input.tangent);
  const material = sampleMaterial(input.uv);
  let color = d.vec3f();
  if (isInEpoxyRegion(input.modelPos)) {
    color = shadeEpoxyApprox(input.modelPos, input.worldPos, normal, tangent, material.albedo);
  } else {
    color = shadeOpaque(
      material.albedo,
      material.roughness,
      material.metallic,
      normal,
      input.worldPos,
    );
  }
  return d.vec4f(tonemapForDisplay(color), 1);
});

export function createMeshRenderer(
  root: TgpuRoot,
  context: GPUCanvasContext,
  canvas: HTMLCanvasElement,
  award: Awaited<ReturnType<typeof loadModel>>,
) {
  const pipeline = root.createRenderPipeline({
    attribs: awardVertexLayout.attrib,
    vertex: awardVertex,
    fragment: awardFragment,
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  const createDepthTexture = () => {
    const texture = root.device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return { texture, view: texture.createView() };
  };

  let depth = createDepthTexture();
  const resizeObserver = new ResizeObserver(() => {
    depth.texture.destroy();
    depth = createDepthTexture();
  });
  resizeObserver.observe(canvas);

  return {
    draw(sharedBindGroup: SharedBindGroup) {
      pipeline
        .with(sharedBindGroup)
        .withColorAttachment({ view: context, loadOp: 'load' })
        .withDepthStencilAttachment({
          view: depth.view,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        })
        .with(awardVertexLayout, award.vertexBuffer)
        .withIndexBuffer(award.indexBuffer)
        .drawIndexed(award.indexCount);
    },
    destroy() {
      resizeObserver.unobserve(canvas);
    },
  };
}
