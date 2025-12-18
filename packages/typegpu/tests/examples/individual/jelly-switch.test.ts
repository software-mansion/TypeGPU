/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockAudioLoading, mockResizeObserver } from '../utils/commonMocks.ts';

describe('jelly switch example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'jelly-switch',
        setupMocks: () => {
          mockResizeObserver();
          mockAudioLoading();
        },
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_0(in: fullScreenTriangle_Input_1) -> fullScreenTriangle_Output_2 {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output_2(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> randomUniform_4: vec2f;

      var<private> seed_7: vec2f;

      fn seed2_6(value: vec2f) {
        seed_7 = value;
      }

      fn randSeed2_5(seed: vec2f) {
        seed2_6(seed);
      }

      struct Camera_10 {
        view: mat4x4f,
        proj: mat4x4f,
        viewInv: mat4x4f,
        projInv: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> cameraUniform_9: Camera_10;

      struct Ray_11 {
        origin: vec3f,
        direction: vec3f,
      }

      fn getRay_8(ndc: vec2f) -> Ray_11 {
        var clipPos = vec4f(ndc.x, ndc.y, -1f, 1f);
        let invView = (&cameraUniform_9.viewInv);
        let invProj = (&cameraUniform_9.projInv);
        var viewPos = ((*invProj) * clipPos);
        var viewPosNormalized = vec4f((viewPos.xyz / viewPos.w), 1f);
        var worldPos = ((*invView) * viewPosNormalized);
        var rayOrigin = (*invView)[3i].xyz;
        var rayDir = normalize((worldPos.xyz - rayOrigin));
        return Ray_11(rayOrigin, rayDir);
      }

      fn sdPlane_14(point: vec3f, normal: vec3f, height: f32) -> f32 {
        return (dot(point, normal) + height);
      }

      fn sdRoundedBox2d_16(point: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        var d = ((abs(point) - size) + vec2f(cornerRadius));
        return ((length(max(d, vec2f())) + min(max(d.x, d.y), 0f)) - cornerRadius);
      }

      fn rectangleCutoutDist_15(position: vec2f) -> f32 {
        const groundRoundness = 0.02;
        const groundRadius = 0.05;
        return sdRoundedBox2d_16(position, vec2f((0.4f + groundRoundness), (groundRadius + groundRoundness)), (groundRadius + groundRoundness));
      }

      fn opExtrudeY_17(point: vec3f, dd: f32, halfHeight: f32) -> f32 {
        var w = vec2f(dd, (abs(point.y) - halfHeight));
        return (min(max(w.x, w.y), 0f) + length(max(w, vec2f())));
      }

      fn opUnion_18(d1: f32, d2: f32) -> f32 {
        return min(d1, d2);
      }

      fn getMainSceneDist_13(position: vec3f) -> f32 {
        const groundThickness = 0.03;
        const groundRoundness = 0.02;
        return opUnion_18(sdPlane_14(position, vec3f(0, 1, 0), 0.06f), (opExtrudeY_17(position, -(rectangleCutoutDist_15(position.xz)), (groundThickness - groundRoundness)) - groundRoundness));
      }

      struct SwitchState_21 {
        progress: f32,
        squashX: f32,
        squashZ: f32,
        wiggleX: f32,
      }

      @group(0) @binding(2) var<uniform> stateUniform_20: SwitchState_21;

      struct DirectionalLight_23 {
        direction: vec3f,
        color: vec3f,
      }

      @group(0) @binding(3) var<uniform> lightUniform_22: DirectionalLight_23;

      fn opRotateAxisAngle_28(p: vec3f, axis: vec3f, angle: f32) -> vec3f {
        return (mix((axis * dot(p, axis)), p, cos(angle)) + (cross(p, axis) * sin(angle)));
      }

      fn opCheapBend_29(p: vec3f, k: f32) -> vec3f {
        let c = cos((k * p.x));
        let s = sin((k * p.x));
        var m = mat2x2f(c, -(s), s, c);
        return vec3f((m * p.xy), p.z);
      }

      fn sdRoundedBox3d_30(point: vec3f, size: vec3f, cornerRadius: f32) -> f32 {
        var d = ((abs(point) - size) + vec3f(cornerRadius));
        return ((length(max(d, vec3f())) + min(max(max(d.x, d.y), d.z), 0f)) - cornerRadius);
      }

      fn getJellyDist_27(position: vec3f) -> f32 {
        let state = (&stateUniform_20);
        var jellyOrigin = vec3f(((((*state).progress - 0.5f) * 0.4f) - (((*state).squashX * ((*state).progress - 0.5f)) * 0.2f)), 0.15000000596046448f, 0f);
        var jellyInvScale = vec3f((1f - (*state).squashX), 1f, (1f - (*state).squashZ));
        var localPos = opRotateAxisAngle_28(((position - jellyOrigin) * jellyInvScale), vec3f(0, 0, 1), (*state).wiggleX);
        return sdRoundedBox3d_30(opCheapBend_29(localPos, 0.8f), vec3f(0.25, 0.20000001788139343, 0.20000001788139343), 0.1f);
      }

      struct HitInfo_31 {
        distance: f32,
        objectType: i32,
      }

      fn getSceneDist_26(position: vec3f) -> HitInfo_31 {
        let mainScene = getMainSceneDist_13(position);
        let jelly = getJellyDist_27(position);
        var hitInfo = HitInfo_31();
        if ((jelly < mainScene)) {
          hitInfo.distance = jelly;
          hitInfo.objectType = 1i;
        }
        else {
          hitInfo.distance = mainScene;
          hitInfo.objectType = 2i;
        }
        return hitInfo;
      }

      fn getApproxNormal_25(p: vec3f, e: f32) -> vec3f {
        let dist = getSceneDist_26(p).distance;
        var n = vec3f((getSceneDist_26((p + vec3f(e, 0f, 0f))).distance - dist), (getSceneDist_26((p + vec3f(0f, e, 0f))).distance - dist), (getSceneDist_26((p + vec3f(0f, 0f, e))).distance - dist));
        return normalize(n);
      }

      fn getNormal_24(position: vec3f) -> vec3f {
        if (((abs(position.z) > 0.5f) || (abs(position.x) > 1.02f))) {
          return vec3f(0, 1, 0);
        }
        return getApproxNormal_25(position, 1e-4f);
      }

      @group(0) @binding(4) var<uniform> jellyColorUniform_32: vec4f;

      fn sqLength_33(a: vec3f) -> f32 {
        return dot(a, a);
      }

      fn getFakeShadow_35(position: vec3f, lightDir: vec3f) -> vec3f {
        if ((position.y < -0.03f)) {
          const fadeSharpness = 30;
          const inset = 0.02;
          let cutout = (rectangleCutoutDist_15(position.xz) + inset);
          let edgeDarkening = saturate((1f - (cutout * f32(fadeSharpness))));
          let lightGradient = saturate((((-(position.z) * 4f) * lightDir.z) + 1f));
          return ((vec3f(1) * edgeDarkening) * (lightGradient * 0.5f));
        }
        return vec3f(1);
      }

      fn calculateLighting_34(hitPosition: vec3f, normal: vec3f, rayOrigin: vec3f) -> vec3f {
        var lightDir = -(lightUniform_22.direction);
        var fakeShadow = getFakeShadow_35(hitPosition, lightDir);
        let diffuse = max(dot(normal, lightDir), 0f);
        var viewDir = normalize((rayOrigin - hitPosition));
        var reflectDir = reflect(-(lightDir), normal);
        let specularFactor = pow(max(dot(viewDir, reflectDir), 0f), 10f);
        var specular = (lightUniform_22.color * (specularFactor * 0.6f));
        var baseColor = vec3f(0.8999999761581421);
        var directionalLight = (((baseColor * lightUniform_22.color) * diffuse) * fakeShadow);
        var ambientLight = ((baseColor * vec3f(0.6000000238418579)) * 0.6);
        var finalSpecular = (specular * fakeShadow);
        return saturate(((directionalLight + ambientLight) + finalSpecular));
      }

      @group(0) @binding(5) var<uniform> darkModeUniform_36: u32;

      fn getSceneDistForAO_39(position: vec3f) -> f32 {
        let mainScene = getMainSceneDist_13(position);
        let jelly = getJellyDist_27(position);
        return min(mainScene, jelly);
      }

      fn calculateAO_38(position: vec3f, normal: vec3f) -> f32 {
        var totalOcclusion = 0f;
        var sampleWeight = 1f;
        const stepDistance = 0.03333333333333333;
        for (var i = 1; (i <= 3i); i++) {
          let sampleHeight = (stepDistance * f32(i));
          var samplePosition = (position + (normal * sampleHeight));
          let distanceToSurface = (getSceneDistForAO_39(samplePosition) - 5e-3f);
          let occlusionContribution = max(0f, (sampleHeight - distanceToSurface));
          totalOcclusion += (occlusionContribution * sampleWeight);
          sampleWeight *= 0.5f;
          if ((totalOcclusion > 0.2f)) {
            break;
          }
        }
        let rawAO = (1f - ((0.5f * totalOcclusion) / 0.1f));
        return saturate(rawAO);
      }

      fn applyAO_37(litColor: vec3f, hitPosition: vec3f, normal: vec3f) -> vec4f {
        let ao = calculateAO_38(hitPosition, normal);
        var finalColor = (litColor * ao);
        return vec4f(finalColor, 1f);
      }

      fn renderBackground_19(rayOrigin: vec3f, rayDirection: vec3f, backgroundHitDist: f32) -> vec4f {
        let state = (&stateUniform_20);
        var hitPosition = (rayOrigin + (rayDirection * backgroundHitDist));
        var offsetX = 0f;
        var offsetZ = 0.05000000074505806f;
        let lightDir = (&lightUniform_22.direction);
        const causticScale = 0.2;
        offsetX -= ((*lightDir).x * causticScale);
        offsetZ += ((*lightDir).z * causticScale);
        var newNormal = getNormal_24(hitPosition);
        let switchX = (((*state).progress - 0.5f) * 0.4f);
        let jellyColor = (&jellyColorUniform_32);
        let sqDist = sqLength_33((hitPosition - vec3f(switchX, 0f, 0f)));
        var bounceLight = ((*jellyColor).xyz * ((1f / ((sqDist * 15f) + 1f)) * 0.4f));
        var sideBounceLight = (((*jellyColor).xyz * ((1f / ((sqDist * 40f) + 1f)) * 0.3f)) * abs(newNormal.z));
        let emission = ((smoothstep(0.7, 1, (*state).progress) * 2f) + 0.7f);
        var litColor = calculateLighting_34(hitPosition, newNormal, rayOrigin);
        var backgroundColor = ((applyAO_37((select(vec3f(1), vec3f(0.20000000298023224), (darkModeUniform_36 == 1u)) * litColor), hitPosition, newNormal) + vec4f((bounceLight * emission), 0f)) + vec4f((sideBounceLight * emission), 0f));
        return vec4f(backgroundColor.xyz, 1f);
      }

      struct BoundingBox_41 {
        min: vec3f,
        max: vec3f,
      }

      fn getJellyBounds_40() -> BoundingBox_41 {
        return BoundingBox_41(vec3f(-1), vec3f(1));
      }

      struct BoxIntersection_43 {
        hit: bool,
        tMin: f32,
        tMax: f32,
      }

      fn intersectBox_42(rayOrigin: vec3f, rayDirection: vec3f, box: BoundingBox_41) -> BoxIntersection_43 {
        var invDir = (vec3f(1) / rayDirection);
        var t1 = ((box.min - rayOrigin) * invDir);
        var t2 = ((box.max - rayOrigin) * invDir);
        var tMinVec = min(t1, t2);
        var tMaxVec = max(t1, t2);
        let tMin = max(max(tMinVec.x, tMinVec.y), tMinVec.z);
        let tMax = min(min(tMaxVec.x, tMaxVec.y), tMaxVec.z);
        var result = BoxIntersection_43();
        result.hit = ((tMax >= tMin) && (tMax >= 0f));
        result.tMin = tMin;
        result.tMax = tMax;
        return result;
      }

      fn fresnelSchlick_44(cosTheta: f32, ior1: f32, ior2: f32) -> f32 {
        let r0 = pow(((ior1 - ior2) / (ior1 + ior2)), 2f);
        return (r0 + ((1f - r0) * pow((1f - cosTheta), 5f)));
      }

      fn rayMarchNoJelly_45(rayOrigin: vec3f, rayDirection: vec3f) -> vec3f {
        var distanceFromOrigin = 0f;
        var hit = 0f;
        for (var i = 0; (i < 6i); i++) {
          var p = (rayOrigin + (rayDirection * distanceFromOrigin));
          hit = getMainSceneDist_13(p);
          distanceFromOrigin += hit;
          if (((distanceFromOrigin > 10f) || (hit < 0.01f))) {
            break;
          }
        }
        if ((distanceFromOrigin < 10f)) {
          return renderBackground_19(rayOrigin, rayDirection, distanceFromOrigin).xyz;
        }
        return vec3f();
      }

      fn beerLambert_46(sigma: vec3f, dist: f32) -> vec3f {
        return exp((sigma * -(dist)));
      }

      fn rayMarch_12(rayOrigin: vec3f, rayDirection: vec3f, _uv: vec2f) -> vec4f {
        var totalSteps = 0u;
        var backgroundDist = 0f;
        for (var i = 0; (i < 64i); i++) {
          var p = (rayOrigin + (rayDirection * backgroundDist));
          let hit = getMainSceneDist_13(p);
          backgroundDist += hit;
          if ((hit < 1e-3f)) {
            break;
          }
        }
        var background = renderBackground_19(rayOrigin, rayDirection, backgroundDist);
        var bbox = getJellyBounds_40();
        var intersection = intersectBox_42(rayOrigin, rayDirection, bbox);
        if (!intersection.hit) {
          return background;
        }
        var distanceFromOrigin = max(0f, intersection.tMin);
        for (var i = 0; (i < 64i); i++) {
          if ((totalSteps >= 64u)) {
            break;
          }
          var currentPosition = (rayOrigin + (rayDirection * distanceFromOrigin));
          var hitInfo = getSceneDist_26(currentPosition);
          distanceFromOrigin += hitInfo.distance;
          totalSteps++;
          if ((hitInfo.distance < 1e-3f)) {
            var hitPosition = (rayOrigin + (rayDirection * distanceFromOrigin));
            if (!(hitInfo.objectType == 1i)) {
              break;
            }
            var N = getNormal_24(hitPosition);
            let I = rayDirection;
            let cosi = min(1f, max(0f, dot(-(I), N)));
            let F = fresnelSchlick_44(cosi, 1f, 1.4199999570846558f);
            var reflection = saturate(vec3f((hitPosition.y + 0.2f)));
            const eta = 0.7042253521126761;
            let k = (1f - ((eta * eta) * (1f - (cosi * cosi))));
            var refractedColor = vec3f();
            if ((k > 0f)) {
              var refrDir = normalize(((I * eta) + (N * ((eta * cosi) - sqrt(k)))));
              var p = (hitPosition + (refrDir * 2e-3));
              var exitPos = (p + (refrDir * 2e-3));
              var env = rayMarchNoJelly_45(exitPos, refrDir);
              let jellyColor = (&jellyColorUniform_32);
              var scatterTint = ((*jellyColor).xyz * 1.5);
              const density = 20f;
              var absorb = ((vec3f(1) - (*jellyColor).xyz) * density);
              let state = (&stateUniform_20);
              let progress = (saturate(mix(1f, 0.6f, ((hitPosition.y * 1.6666666004392863f) + 0.25f))) * (*state).progress);
              var T = beerLambert_46((absorb * pow(progress, 2f)), 0.08f);
              var lightDir = -(lightUniform_22.direction);
              let forward = max(0f, dot(lightDir, refrDir));
              var scatter = (scatterTint * ((3f * forward) * pow(progress, 3f)));
              refractedColor = ((env * T) + scatter);
            }
            var jelly = ((reflection * F) + (refractedColor * (1f - F)));
            return vec4f(jelly, 1f);
          }
          if ((distanceFromOrigin > backgroundDist)) {
            break;
          }
        }
        return background;
      }

      struct raymarchFn_Input_47 {
        @location(0) uv: vec2f,
      }

      @fragment fn raymarchFn_3(_arg_0: raymarchFn_Input_47) -> @location(0) vec4f {
        randSeed2_5((randomUniform_4 * _arg_0.uv));
        var ndc = vec2f(((_arg_0.uv.x * 2f) - 1f), -(((_arg_0.uv.y * 2f) - 1f)));
        var ray = getRay_8(ndc);
        var color = rayMarch_12(ray.origin, ray.direction, _arg_0.uv);
        let exposure = select(1.5, 2., (darkModeUniform_36 == 1u));
        return vec4f(tanh((color.xyz * exposure)), 1f);
      }

      @group(0) @binding(0) var currentTexture_1: texture_2d<f32>;

      @group(0) @binding(1) var historyTexture_2: texture_2d<f32>;

      @group(0) @binding(2) var outputTexture_3: texture_storage_2d<rgba8unorm, write>;

      struct taaResolveFn_Input_4 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn taaResolveFn_0(_arg_0: taaResolveFn_Input_4) {
        var currentColor = textureLoad(currentTexture_1, _arg_0.gid.xy, 0);
        var historyColor = textureLoad(historyTexture_2, _arg_0.gid.xy, 0);
        var minColor = vec3f(9999);
        var maxColor = vec3f(-9999);
        var dimensions = textureDimensions(currentTexture_1);
        for (var x = -1; (x <= 1i); x++) {
          for (var y = -1; (y <= 1i); y++) {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(x, y));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture_1, clampedCoord, 0);
            minColor = min(minColor, neighborColor.xyz);
            maxColor = max(maxColor, neighborColor.xyz);
          }
        }
        var historyColorClamped = clamp(historyColor.xyz, minColor, maxColor);
        const blendFactor = 0.8999999761581421f;
        var resolvedColor = vec4f(mix(currentColor.xyz, historyColorClamped, blendFactor), 1f);
        textureStore(outputTexture_3, vec2u(_arg_0.gid.x, _arg_0.gid.y), resolvedColor);
      }

      struct fullScreenTriangle_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_0(in: fullScreenTriangle_Input_1) -> fullScreenTriangle_Output_2 {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output_2(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(1) @binding(0) var currentTexture_4: texture_2d<f32>;

      @group(0) @binding(0) var filteringSampler_5: sampler;

      struct fragmentMain_Input_6 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain_3(input: fragmentMain_Input_6) -> @location(0) vec4f {
        return textureSample(currentTexture_4, filteringSampler_5, input.uv);
      }"
    `);
  });
});
