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
      "struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> randomUniform: vec2f;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      struct Camera {
        view: mat4x4f,
        proj: mat4x4f,
        viewInv: mat4x4f,
        projInv: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> uniform_1: Camera;

      struct Ray {
        origin: vec3f,
        direction: vec3f,
      }

      fn getRay(ndc: vec2f) -> Ray {
        var clipPos = vec4f(ndc.x, ndc.y, -1f, 1f);
        let invView = (&uniform_1.viewInv);
        let invProj = (&uniform_1.projInv);
        var viewPos = ((*invProj) * clipPos);
        var viewPosNormalized = vec4f((viewPos.xyz / viewPos.w), 1f);
        var worldPos = ((*invView) * viewPosNormalized);
        var rayOrigin = (*invView)[3i].xyz;
        var rayDir = normalize((worldPos.xyz - rayOrigin));
        return Ray(rayOrigin, rayDir);
      }

      fn sdPlane(point: vec3f, normal: vec3f, height: f32) -> f32 {
        return (dot(point, normal) + height);
      }

      fn sdRoundedBox2d(point: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        var d = ((abs(point) - size) + vec2f(cornerRadius));
        return ((length(max(d, vec2f())) + min(max(d.x, d.y), 0f)) - cornerRadius);
      }

      fn rectangleCutoutDist(position: vec2f) -> f32 {
        const groundRoundness = 0.02;
        const groundRadius = 0.05;
        return sdRoundedBox2d(position, vec2f((0.4f + groundRoundness), (groundRadius + groundRoundness)), (groundRadius + groundRoundness));
      }

      fn opExtrudeY(point: vec3f, dd: f32, halfHeight: f32) -> f32 {
        var w = vec2f(dd, (abs(point.y) - halfHeight));
        return (min(max(w.x, w.y), 0f) + length(max(w, vec2f())));
      }

      fn opUnion(d1: f32, d2: f32) -> f32 {
        return min(d1, d2);
      }

      fn getMainSceneDist(position: vec3f) -> f32 {
        const groundThickness = 0.03;
        const groundRoundness = 0.02;
        return opUnion(sdPlane(position, vec3f(0, 1, 0), 0.06f), (opExtrudeY(position, -(rectangleCutoutDist(position.xz)), (groundThickness - groundRoundness)) - groundRoundness));
      }

      struct SwitchState {
        progress: f32,
        squashX: f32,
        squashZ: f32,
        wiggleX: f32,
      }

      @group(0) @binding(2) var<uniform> stateUniform: SwitchState;

      fn opRotateAxisAngle(p: vec3f, axis: vec3f, angle: f32) -> vec3f {
        return (mix((axis * dot(p, axis)), p, cos(angle)) + (cross(p, axis) * sin(angle)));
      }

      fn opCheapBend(p: vec3f, k: f32) -> vec3f {
        let c = cos((k * p.x));
        let s = sin((k * p.x));
        var m = mat2x2f(c, -(s), s, c);
        return vec3f((m * p.xy), p.z);
      }

      fn sdRoundedBox3d(point: vec3f, size: vec3f, cornerRadius: f32) -> f32 {
        var d = ((abs(point) - size) + vec3f(cornerRadius));
        return ((length(max(d, vec3f())) + min(max(max(d.x, d.y), d.z), 0f)) - cornerRadius);
      }

      fn getJellyDist(position: vec3f) -> f32 {
        let state = (&stateUniform);
        var jellyOrigin = vec3f(((((*state).progress - 0.5f) * 0.4f) - (((*state).squashX * ((*state).progress - 0.5f)) * 0.2f)), 0.15000000596046448f, 0f);
        var jellyInvScale = vec3f((1f - (*state).squashX), 1f, (1f - (*state).squashZ));
        var localPos = opRotateAxisAngle(((position - jellyOrigin) * jellyInvScale), vec3f(0, 0, 1), (*state).wiggleX);
        return sdRoundedBox3d(opCheapBend(localPos, 0.8f), vec3f(0.25, 0.20000001788139343, 0.20000001788139343), 0.1f);
      }

      struct HitInfo {
        distance: f32,
        objectType: i32,
      }

      fn getSceneDist(position: vec3f) -> HitInfo {
        let mainScene = getMainSceneDist(position);
        let jelly = getJellyDist(position);
        var hitInfo = HitInfo();
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

      fn getApproxNormal(p: vec3f, e: f32) -> vec3f {
        let dist = getSceneDist(p).distance;
        var n = vec3f((getSceneDist((p + vec3f(e, 0f, 0f))).distance - dist), (getSceneDist((p + vec3f(0f, e, 0f))).distance - dist), (getSceneDist((p + vec3f(0f, 0f, e))).distance - dist));
        return normalize(n);
      }

      fn getNormal(position: vec3f) -> vec3f {
        if (((abs(position.z) > 0.5f) || (abs(position.x) > 1.02f))) {
          return vec3f(0, 1, 0);
        }
        return getApproxNormal(position, 1e-4f);
      }

      @group(0) @binding(3) var<uniform> jellyColorUniform: vec4f;

      fn sqLength(a: vec3f) -> f32 {
        return dot(a, a);
      }

      struct DirectionalLight {
        direction: vec3f,
        color: vec3f,
      }

      @group(0) @binding(4) var<uniform> lightUniform: DirectionalLight;

      fn getFakeShadow(position: vec3f, lightDir: vec3f) -> vec3f {
        if ((position.y < -0.03f)) {
          const fadeSharpness = 30;
          const inset = 0.02;
          let cutout = (rectangleCutoutDist(position.xz) + inset);
          let edgeDarkening = saturate((1f - (cutout * f32(fadeSharpness))));
          let lightGradient = saturate((((-(position.z) * 4f) * lightDir.z) + 1f));
          return ((vec3f(1) * edgeDarkening) * (lightGradient * 0.5f));
        }
        return vec3f(1);
      }

      fn calculateLighting(hitPosition: vec3f, normal: vec3f, rayOrigin: vec3f) -> vec3f {
        var lightDir = -(lightUniform.direction);
        var fakeShadow = getFakeShadow(hitPosition, lightDir);
        let diffuse = max(dot(normal, lightDir), 0f);
        var viewDir = normalize((rayOrigin - hitPosition));
        var reflectDir = reflect(-(lightDir), normal);
        let specularFactor = pow(max(dot(viewDir, reflectDir), 0f), 10f);
        var specular = (lightUniform.color * (specularFactor * 0.6f));
        var baseColor = vec3f(0.8999999761581421);
        var directionalLight = (((baseColor * lightUniform.color) * diffuse) * fakeShadow);
        var ambientLight = ((baseColor * vec3f(0.6000000238418579)) * 0.6f);
        var finalSpecular = (specular * fakeShadow);
        return saturate(((directionalLight + ambientLight) + finalSpecular));
      }

      @group(0) @binding(5) var<uniform> darkModeUniform: u32;

      fn getSceneDistForAO(position: vec3f) -> f32 {
        let mainScene = getMainSceneDist(position);
        let jelly = getJellyDist(position);
        return min(mainScene, jelly);
      }

      fn calculateAO(position: vec3f, normal: vec3f) -> f32 {
        var totalOcclusion = 0f;
        var sampleWeight = 1f;
        const stepDistance = 0.03333333333333333;
        for (var i = 1; (i <= 3i); i++) {
          let sampleHeight = (stepDistance * f32(i));
          var samplePosition = (position + (normal * sampleHeight));
          let distanceToSurface = (getSceneDistForAO(samplePosition) - 5e-3f);
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

      fn applyAO(litColor: vec3f, hitPosition: vec3f, normal: vec3f) -> vec4f {
        let ao = calculateAO(hitPosition, normal);
        var finalColor = (litColor * ao);
        return vec4f(finalColor, 1f);
      }

      fn renderBackground(rayOrigin: vec3f, rayDirection: vec3f, backgroundHitDist: f32) -> vec4f {
        let state = (&stateUniform);
        var hitPosition = (rayOrigin + (rayDirection * backgroundHitDist));
        var newNormal = getNormal(hitPosition);
        let switchX = (((*state).progress - 0.5f) * 0.4f);
        let jellyColor = (&jellyColorUniform);
        let sqDist = sqLength((hitPosition - vec3f(switchX, 0f, 0f)));
        var bounceLight = ((*jellyColor).rgb * ((1f / ((sqDist * 15f) + 1f)) * 0.4f));
        var sideBounceLight = (((*jellyColor).rgb * ((1f / ((sqDist * 40f) + 1f)) * 0.3f)) * abs(newNormal.z));
        let emission = ((smoothstep(0.7f, 1f, (*state).progress) * 2f) + 0.7f);
        var litColor = calculateLighting(hitPosition, newNormal, rayOrigin);
        var backgroundColor = ((applyAO((select(vec3f(1), vec3f(0.20000000298023224), (darkModeUniform == 1u)) * litColor), hitPosition, newNormal) + vec4f((bounceLight * emission), 0f)) + vec4f((sideBounceLight * emission), 0f));
        return vec4f(backgroundColor.rgb, 1f);
      }

      struct BoundingBox {
        min: vec3f,
        max: vec3f,
      }

      fn getJellyBounds() -> BoundingBox {
        return BoundingBox(vec3f(-1), vec3f(1));
      }

      struct BoxIntersection {
        hit: bool,
        tMin: f32,
        tMax: f32,
      }

      fn intersectBox(rayOrigin: vec3f, rayDirection: vec3f, box: BoundingBox) -> BoxIntersection {
        var invDir = (vec3f(1) / rayDirection);
        var t1 = ((box.min - rayOrigin) * invDir);
        var t2 = ((box.max - rayOrigin) * invDir);
        var tMinVec = min(t1, t2);
        var tMaxVec = max(t1, t2);
        let tMin = max(max(tMinVec.x, tMinVec.y), tMinVec.z);
        let tMax = min(min(tMaxVec.x, tMaxVec.y), tMaxVec.z);
        var result = BoxIntersection();
        result.hit = ((tMax >= tMin) && (tMax >= 0f));
        result.tMin = tMin;
        result.tMax = tMax;
        return result;
      }

      fn fresnelSchlick(cosTheta: f32, ior1: f32, ior2: f32) -> f32 {
        let r0 = pow(((ior1 - ior2) / (ior1 + ior2)), 2f);
        return (r0 + ((1f - r0) * pow((1f - cosTheta), 5f)));
      }

      fn rayMarchNoJelly(rayOrigin: vec3f, rayDirection: vec3f) -> vec3f {
        var distanceFromOrigin = 0f;
        var hit = 0f;
        for (var i = 0; (i < 6i); i++) {
          var p = (rayOrigin + (rayDirection * distanceFromOrigin));
          hit = getMainSceneDist(p);
          distanceFromOrigin += hit;
          if (((distanceFromOrigin > 10f) || (hit < 0.01f))) {
            break;
          }
        }
        if ((distanceFromOrigin < 10f)) {
          return renderBackground(rayOrigin, rayDirection, distanceFromOrigin).xyz;
        }
        return vec3f();
      }

      fn beerLambert(sigma: vec3f, dist: f32) -> vec3f {
        return exp((sigma * -(dist)));
      }

      fn rayMarch(rayOrigin: vec3f, rayDirection: vec3f, _uv: vec2f) -> vec4f {
        var totalSteps = 0u;
        var backgroundDist = 0f;
        for (var i = 0; (i < 64i); i++) {
          var p = (rayOrigin + (rayDirection * backgroundDist));
          let hit = getMainSceneDist(p);
          backgroundDist += hit;
          if ((hit < 1e-3f)) {
            break;
          }
        }
        var background = renderBackground(rayOrigin, rayDirection, backgroundDist);
        var bbox = getJellyBounds();
        var intersection = intersectBox(rayOrigin, rayDirection, bbox);
        if (!intersection.hit) {
          return background;
        }
        var distanceFromOrigin = max(0f, intersection.tMin);
        for (var i = 0; (i < 64i); i++) {
          if ((totalSteps >= 64u)) {
            break;
          }
          var currentPosition = (rayOrigin + (rayDirection * distanceFromOrigin));
          var hitInfo = getSceneDist(currentPosition);
          distanceFromOrigin += hitInfo.distance;
          totalSteps++;
          if ((hitInfo.distance < 1e-3f)) {
            var hitPosition = (rayOrigin + (rayDirection * distanceFromOrigin));
            if (!(hitInfo.objectType == 1i)) {
              break;
            }
            var N = getNormal(hitPosition);
            let I = rayDirection;
            let cosi = min(1f, max(0f, dot(-(I), N)));
            let F = fresnelSchlick(cosi, 1f, 1.4199999570846558f);
            var reflection = saturate(vec3f((hitPosition.y + 0.2f)));
            const eta = 0.7042253521126761;
            let k = (1f - ((eta * eta) * (1f - (cosi * cosi))));
            var refractedColor = vec3f();
            if ((k > 0f)) {
              var refrDir = normalize(((I * eta) + (N * ((eta * cosi) - sqrt(k)))));
              var p = (hitPosition + (refrDir * 2e-3f));
              var exitPos = (p + (refrDir * 2e-3f));
              var env = rayMarchNoJelly(exitPos, refrDir);
              let jellyColor = (&jellyColorUniform);
              var scatterTint = ((*jellyColor).rgb * 1.5f);
              const density = 20f;
              var absorb = ((vec3f(1) - (*jellyColor).rgb) * density);
              let state = (&stateUniform);
              let progress = (saturate(mix(1f, 0.6f, ((hitPosition.y * 1.6666666004392863f) + 0.25f))) * (*state).progress);
              var T = beerLambert((absorb * pow(progress, 2f)), 0.08f);
              var lightDir = -(lightUniform.direction);
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

      struct raymarchFn_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn raymarchFn(_arg_0: raymarchFn_Input) -> @location(0) vec4f {
        randSeed2((randomUniform * _arg_0.uv));
        var ndc = vec2f(((_arg_0.uv.x * 2f) - 1f), -(((_arg_0.uv.y * 2f) - 1f)));
        var ray = getRay(ndc);
        var color = rayMarch(ray.origin, ray.direction, _arg_0.uv);
        let exposure = select(1.5, 2., (darkModeUniform == 1u));
        return vec4f(tanh((color.rgb * exposure)), 1f);
      }

      @group(0) @binding(0) var currentTexture: texture_2d<f32>;

      @group(0) @binding(1) var historyTexture: texture_2d<f32>;

      @group(0) @binding(2) var outputTexture: texture_storage_2d<rgba8unorm, write>;

      struct taaResolveFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn taaResolveFn(_arg_0: taaResolveFn_Input) {
        var currentColor = textureLoad(currentTexture, _arg_0.gid.xy, 0);
        var historyColor = textureLoad(historyTexture, _arg_0.gid.xy, 0);
        var minColor = vec3f(9999);
        var maxColor = vec3f(-9999);
        var dimensions = textureDimensions(currentTexture);
        // unrolled iteration #0, 'x' is '-1'
        {
          // unrolled iteration #0, 'y' is '-1'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(-1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #1, 'y' is '0'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(-1, 0));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #2, 'y' is '1'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(-1, 1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
        }
        // unrolled iteration #1, 'x' is '0'
        {
          // unrolled iteration #0, 'y' is '-1'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(0, -1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #1, 'y' is '0'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i());
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #2, 'y' is '1'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(0, 1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
        }
        // unrolled iteration #2, 'x' is '1'
        {
          // unrolled iteration #0, 'y' is '-1'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(1, -1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #1, 'y' is '0'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(1, 0));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #2, 'y' is '1'
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
        }
        var historyColorClamped = clamp(historyColor.rgb, minColor, maxColor);
        const blendFactor = 0.8999999761581421f;
        var resolvedColor = vec4f(mix(currentColor.rgb, historyColorClamped, blendFactor), 1f);
        textureStore(outputTexture, vec2u(_arg_0.gid.x, _arg_0.gid.y), resolvedColor);
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(1) @binding(0) var currentTexture: texture_2d<f32>;

      @group(0) @binding(0) var filteringSampler: sampler;

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(input: fragmentMain_Input) -> @location(0) vec4f {
        return textureSample(currentTexture, filteringSampler, input.uv);
      }"
    `);
  });
});
