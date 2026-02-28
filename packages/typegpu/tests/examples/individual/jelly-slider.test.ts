/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockFonts,
  mockImageLoading,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('jelly-slider example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'jelly-slider',
        setupMocks: () => {
          mockFonts();
          mockImageLoading();
          mockResizeObserver();
          mockCreateImageBitmap();
        },
        expectedCalls: 6,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
        const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
      }


      @group(0) @binding(0) var src: texture_2d<f32>;
      @group(0) @binding(1) var samp: sampler;

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(src, samp, uv);
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
        return sdRoundedBox2d(position, vec2f((1f + groundRoundness), (0.2f + groundRoundness)), (0.2f + groundRoundness));
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

      @group(0) @binding(2) var<uniform> endCapUniform: vec4f;

      @group(0) @binding(3) var digitsTextureView: texture_2d_array<f32>;

      @group(0) @binding(4) var filteringSampler: sampler;

      fn renderPercentageOnGround(hitPosition: vec3f, center: vec3f, percentage: u32) -> vec4f {
        const textWidth = 0.38;
        const textHeight = 0.33;
        if (((abs((hitPosition.x - center.x)) > (textWidth * 0.5f)) || (abs((hitPosition.z - center.z)) > (textHeight * 0.5f)))) {
          return vec4f();
        }
        let localX = (hitPosition.x - center.x);
        let localZ = (hitPosition.z - center.z);
        let uvX = ((localX + (textWidth * 0.5f)) / textWidth);
        let uvZ = ((localZ + (textHeight * 0.5f)) / textHeight);
        if (((((uvX < 0f) || (uvX > 1f)) || (uvZ < 0f)) || (uvZ > 1f))) {
          return vec4f();
        }
        return textureSampleLevel(digitsTextureView, filteringSampler, vec2f(uvX, uvZ), percentage, 0);
      }

      struct DirectionalLight {
        direction: vec3f,
        color: vec3f,
      }

      @group(0) @binding(5) var<uniform> lightUniform: DirectionalLight;

      @group(0) @binding(6) var bezierTexture: texture_2d<f32>;

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      fn getNormalFromSdf(position: vec3f, epsilon: f32) -> vec3f {
        var k = vec3f(1, -1, 0);
        var offset1 = (k.xyy * epsilon);
        var offset2 = (k.yyx * epsilon);
        var offset3 = (k.yxy * epsilon);
        var offset4 = (k.xxx * epsilon);
        var sample1 = (offset1 * getMainSceneDist((position + offset1)));
        var sample2 = (offset2 * getMainSceneDist((position + offset2)));
        var sample3 = (offset3 * getMainSceneDist((position + offset3)));
        var sample4 = (offset4 * getMainSceneDist((position + offset4)));
        var gradient = (((sample1 + sample2) + sample3) + sample4);
        return normalize(gradient);
      }

      fn getNormalMain(position: vec3f) -> vec3f {
        if (((abs(position.z) > 0.22f) || (abs(position.x) > 1.02f))) {
          return vec3f(0, 1, 0);
        }
        return getNormalFromSdf(position, 1e-4f);
      }

      @group(0) @binding(7) var<uniform> jellyColorUniform: vec4f;

      fn sqLength(a: vec3f) -> f32 {
        return dot(a, a);
      }

      fn getFakeShadow(position: vec3f, lightDir: vec3f) -> vec3f {
        let jellyColor = (&jellyColorUniform);
        let endCapX = endCapUniform.x;
        if ((position.y < -0.03f)) {
          const fadeSharpness = 30;
          const inset = 0.02;
          let cutout = (rectangleCutoutDist(position.xz) + inset);
          let edgeDarkening = saturate((1f - (cutout * f32(fadeSharpness))));
          let lightGradient = saturate((((-(position.z) * 4f) * lightDir.z) + 1f));
          return ((vec3f(1) * edgeDarkening) * (lightGradient * 0.5f));
        }
        else {
          var finalUV = vec2f((((position.x - ((position.z * lightDir.x) * sign(lightDir.z))) * 0.5f) + 0.5f), ((1f - ((-(position.z) / lightDir.z) * 0.5f)) - 0.2f));
          var data = textureSampleLevel(bezierTexture, filteringSampler, finalUV, 0);
          let jellySaturation = mix(0f, data.y, saturate(((position.x * 1.5f) + 1.1f)));
          var shadowColor = mix(vec3f(), (*jellyColor).rgb, jellySaturation);
          let contrast = ((20f * saturate(finalUV.y)) * (0.8f + (endCapX * 0.2f)));
          const shadowOffset = -0.3;
          const featherSharpness = 10;
          let uvEdgeFeather = (((saturate((finalUV.x * f32(featherSharpness))) * saturate(((1f - finalUV.x) * f32(featherSharpness)))) * saturate(((1f - finalUV.y) * f32(featherSharpness)))) * saturate(finalUV.y));
          let influence = (saturate(((1f - lightDir.y) * 2f)) * uvEdgeFeather);
          return mix(vec3f(1), mix(shadowColor, vec3f(1), saturate(((data.x * contrast) + shadowOffset))), influence);
        }
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

      struct SdfBbox {
        left: f32,
        right: f32,
        bottom: f32,
        top: f32,
      }

      fn getSliderBbox() -> SdfBbox {
        return SdfBbox(-1.0190000534057617f, 1.0899999141693115f, -0.30000001192092896f, 0.6499999761581421f);
      }

      struct LineInfo {
        t: f32,
        distance: f32,
        normal: vec2f,
      }

      fn sdInflatedPolyline2D(p: vec2f) -> LineInfo {
        var bbox = getSliderBbox();
        var uv = vec2f(((p.x - bbox.left) / (bbox.right - bbox.left)), ((bbox.top - p.y) / (bbox.top - bbox.bottom)));
        var clampedUV = saturate(uv);
        var sampledColor = textureSampleLevel(bezierTexture, filteringSampler, clampedUV, 0);
        let segUnsigned = sampledColor.x;
        let progress = sampledColor.y;
        var normal = sampledColor.zw;
        return LineInfo(progress, segUnsigned, normal);
      }

      fn opExtrudeZ(point: vec3f, dd: f32, halfHeight: f32) -> f32 {
        var w = vec2f(dd, (abs(point.z) - halfHeight));
        return (min(max(w.x, w.y), 0f) + length(max(w, vec2f())));
      }

      fn sliderApproxDist(position: vec3f) -> f32 {
        var bbox = getSliderBbox();
        var p = position.xy;
        if (((((p.x < bbox.left) || (p.x > bbox.right)) || (p.y < bbox.bottom)) || (p.y > bbox.top))) {
          return 1000000000;
        }
        var poly2D = sdInflatedPolyline2D(p);
        let dist3D = (opExtrudeZ(position, poly2D.distance, 0.17f) - 0.024f);
        return dist3D;
      }

      fn getSceneDistForAO(position: vec3f) -> f32 {
        let mainScene = getMainSceneDist(position);
        let sliderApprox = sliderApproxDist(position);
        return min(mainScene, sliderApprox);
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

      fn renderBackground(rayOrigin: vec3f, rayDirection: vec3f, backgroundHitDist: f32, offset: f32) -> vec4f {
        var hitPosition = (rayOrigin + (rayDirection * backgroundHitDist));
        var percentageSample = renderPercentageOnGround(hitPosition, vec3f(0.7200000286102295, 0, 0), u32(((endCapUniform.x + 0.43f) * 84f)));
        var highlights = 0f;
        const highlightWidth = 1f;
        const highlightHeight = 0.2;
        var offsetX = 0f;
        var offsetZ = 0.05000000074505806f;
        let lightDir = (&lightUniform.direction);
        const causticScale = 0.2;
        offsetX -= ((*lightDir).x * causticScale);
        offsetZ += ((*lightDir).z * causticScale);
        let endCapX = endCapUniform.x;
        let sliderStretch = ((endCapX + 1f) * 0.5f);
        if (((abs((hitPosition.x + offsetX)) < highlightWidth) && (abs((hitPosition.z + offsetZ)) < highlightHeight))) {
          let uvX_orig = ((((hitPosition.x + offsetX) + (highlightWidth * 2f)) / highlightWidth) * 0.5f);
          let uvZ_orig = ((((hitPosition.z + offsetZ) + (highlightHeight * 2f)) / highlightHeight) * 0.5f);
          var centeredUV = vec2f((uvX_orig - 0.5f), (uvZ_orig - 0.5f));
          var finalUV = vec2f(centeredUV.x, (1f - (pow((abs((centeredUV.y - 0.5f)) * 2f), 2f) * 0.3f)));
          let density = max(0f, ((textureSampleLevel(bezierTexture, filteringSampler, finalUV, 0).x - 0.25f) * 8f));
          let fadeX = smoothstep(0f, -0.2f, (hitPosition.x - endCapX));
          let fadeZ = (1f - pow((abs((centeredUV.y - 0.5f)) * 2f), 3f));
          let fadeStretch = saturate((1f - sliderStretch));
          let edgeFade = ((saturate(fadeX) * saturate(fadeZ)) * fadeStretch);
          highlights = ((((pow(density, 3f) * edgeFade) * 3f) * (1f + (*lightDir).z)) / 1.5f);
        }
        let originYBound = saturate((rayOrigin.y + 0.01f));
        var posOffset = (hitPosition + (vec3f(0, 1, 0) * ((offset * (originYBound / (1f + originYBound))) * (1f + (randFloat01() / 2f)))));
        var newNormal = getNormalMain(posOffset);
        let jellyColor = (&jellyColorUniform);
        let sqDist = sqLength((hitPosition - vec3f(endCapX, 0f, 0f)));
        var bounceLight = ((*jellyColor).rgb * ((1f / ((sqDist * 15f) + 1f)) * 0.4f));
        var sideBounceLight = (((*jellyColor).rgb * ((1f / ((sqDist * 40f) + 1f)) * 0.3f)) * abs(newNormal.z));
        var litColor = calculateLighting(posOffset, newNormal, rayOrigin);
        var backgroundColor = ((applyAO((vec3f(1) * litColor), posOffset, newNormal) + vec4f(bounceLight, 0f)) + vec4f(sideBounceLight, 0f));
        var textColor = saturate((backgroundColor.rgb * vec3f(0.5)));
        return vec4f((mix(backgroundColor.rgb, textColor, percentageSample.x) * (1f + highlights)), 1f);
      }

      struct BoxIntersection {
        hit: bool,
        tMin: f32,
        tMax: f32,
      }

      fn intersectBox(rayOrigin: vec3f, rayDirection: vec3f, boxMin: vec3f, boxMax: vec3f) -> BoxIntersection {
        var invDir = (vec3f(1) / rayDirection);
        var t1 = ((boxMin - rayOrigin) * invDir);
        var t2 = ((boxMax - rayOrigin) * invDir);
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

      fn sdPie(point: vec2f, sc: vec2f, radius: f32) -> f32 {
        var p_w = point;
        p_w.x = abs(point.x);
        let l = (length(p_w) - radius);
        let m = length((p_w - (sc * clamp(dot(p_w, sc), 0f, radius))));
        return max(l, (m * sign(((sc.y * p_w.x) - (sc.x * p_w.y)))));
      }

      fn cap3D(position: vec3f) -> f32 {
        let endCap = (&endCapUniform);
        var secondLastPoint = vec2f((*endCap).x, (*endCap).y);
        var lastPoint = vec2f((*endCap).z, (*endCap).w);
        let angle = atan2((lastPoint.y - secondLastPoint.y), (lastPoint.x - secondLastPoint.x));
        var rot = mat2x2f(cos(angle), -(sin(angle)), sin(angle), cos(angle));
        var pieP = (position - vec3f(secondLastPoint, 0f));
        pieP = vec3f((rot * pieP.xy), pieP.z);
        let hmm = sdPie(pieP.zx, vec2f(1, 0), 0.17f);
        let extrudeEnd = (opExtrudeY(pieP, hmm, 1e-3f) - 0.024f);
        return extrudeEnd;
      }

      fn sliderSdf3D(position: vec3f) -> LineInfo {
        var poly2D = sdInflatedPolyline2D(position.xy);
        var finalDist = 0f;
        if ((poly2D.t > 0.94f)) {
          finalDist = cap3D(position);
        }
        else {
          let body = (opExtrudeZ(position, poly2D.distance, 0.17f) - 0.024f);
          finalDist = body;
        }
        return LineInfo(poly2D.t, finalDist, poly2D.normal);
      }

      struct HitInfo {
        distance: f32,
        objectType: i32,
        t: f32,
      }

      fn getSceneDist(position: vec3f) -> HitInfo {
        let mainScene = getMainSceneDist(position);
        var poly3D = sliderSdf3D(position);
        var hitInfo = HitInfo();
        if ((poly3D.distance < mainScene)) {
          hitInfo.distance = poly3D.distance;
          hitInfo.objectType = 1i;
          hitInfo.t = poly3D.t;
        }
        else {
          hitInfo.distance = mainScene;
          hitInfo.objectType = 2i;
        }
        return hitInfo;
      }

      fn getNormalFromSdf_1(position: vec3f, epsilon: f32) -> vec3f {
        var k = vec3f(1, -1, 0);
        var offset1 = (k.xyy * epsilon);
        var offset2 = (k.yyx * epsilon);
        var offset3 = (k.yxy * epsilon);
        var offset4 = (k.xxx * epsilon);
        var sample1 = (offset1 * cap3D((position + offset1)));
        var sample2 = (offset2 * cap3D((position + offset2)));
        var sample3 = (offset3 * cap3D((position + offset3)));
        var sample4 = (offset4 * cap3D((position + offset4)));
        var gradient = (((sample1 + sample2) + sample3) + sample4);
        return normalize(gradient);
      }

      fn getNormalCap(pos: vec3f) -> vec3f {
        return getNormalFromSdf_1(pos, 0.01f);
      }

      fn getSliderNormal(position: vec3f, hitInfo: HitInfo) -> vec3f {
        var poly2D = sdInflatedPolyline2D(position.xy);
        let gradient2D = (&poly2D.normal);
        const threshold = 0.14450000000000002;
        let absZ = abs(position.z);
        let zDistance = max(0f, (((absZ - threshold) * 0.17f) / (0.17f - threshold)));
        let edgeDistance = (0.024f - poly2D.distance);
        const edgeContrib = 0.9;
        let zContrib = (1f - edgeContrib);
        let zDirection = sign(position.z);
        var zAxisVector = vec3f(0f, 0f, zDirection);
        let edgeBlendDistance = ((edgeContrib * 0.024f) + (zContrib * 0.17f));
        let blendFactor = smoothstep(edgeBlendDistance, 0f, ((zDistance * zContrib) + (edgeDistance * edgeContrib)));
        var normal2D = vec3f((*gradient2D).xy, 0f);
        var blendedNormal = mix(zAxisVector, normal2D, ((blendFactor * 0.5f) + 0.5f));
        var normal = normalize(blendedNormal);
        if ((hitInfo.t > 0.94f)) {
          let ratio = ((hitInfo.t - 0.94f) / 0.02f);
          var fullNormal = getNormalCap(position);
          normal = normalize(mix(normal, fullNormal, ratio));
        }
        return normal;
      }

      fn getNormal(position: vec3f, hitInfo: HitInfo) -> vec3f {
        if (((hitInfo.objectType == 1i) && (hitInfo.t < 0.96f))) {
          return getSliderNormal(position, hitInfo);
        }
        return select(getNormalCap(position), getNormalMain(position), (hitInfo.objectType == 2i));
      }

      fn fresnelSchlick(cosTheta: f32, ior1: f32, ior2: f32) -> f32 {
        let r0 = pow(((ior1 - ior2) / (ior1 + ior2)), 2f);
        return (r0 + ((1f - r0) * pow((1f - cosTheta), 5f)));
      }

      @group(0) @binding(8) var<uniform> blurEnabledUniform: u32;

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
          return renderBackground(rayOrigin, rayDirection, distanceFromOrigin, select(0f, 0.87f, (blurEnabledUniform == 1u))).rgb;
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
        var background = renderBackground(rayOrigin, rayDirection, backgroundDist, 0f);
        var bbox = getSliderBbox();
        const zDepth = 0.25f;
        var sliderMin = vec3f(bbox.left, bbox.bottom, -(zDepth));
        var sliderMax = vec3f(bbox.right, bbox.top, zDepth);
        var intersection = intersectBox(rayOrigin, rayDirection, sliderMin, sliderMax);
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
            var N = getNormal(hitPosition, hitInfo);
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
              let progress = hitInfo.t;
              let jellyColor = (&jellyColorUniform);
              var scatterTint = ((*jellyColor).rgb * 1.5f);
              const density = 20f;
              var absorb = ((vec3f(1) - (*jellyColor).rgb) * density);
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
        return vec4f(tanh((color.rgb * 1.3f)), 1f);
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
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(-1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #1
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(-1, 0));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #2
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(-1, 1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(0, -1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #1
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i());
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #2
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(0, 1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(1, -1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #1
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(1, 0));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
          // unrolled iteration #2
          {
            var sampleCoord = (vec2i(_arg_0.gid.xy) + vec2i(1));
            var clampedCoord = clamp(sampleCoord, vec2i(), (vec2i(dimensions.xy) - vec2i(1)));
            var neighborColor = textureLoad(currentTexture, clampedCoord, 0);
            minColor = min(minColor, neighborColor.rgb);
            maxColor = max(maxColor, neighborColor.rgb);
          }
        }
        var historyColorClamped = clamp(historyColor.rgb, minColor, maxColor);
        var uv = (vec2f(_arg_0.gid.xy) / vec2f(dimensions.xy));
        const textRegionMinX = 0.7099999785423279f;
        const textRegionMaxX = 0.8500000238418579f;
        const textRegionMinY = 0.4699999988079071f;
        const textRegionMaxY = 0.550000011920929f;
        const borderSize = 0.019999999552965164f;
        let fadeInX = smoothstep((textRegionMinX - borderSize), (textRegionMinX + borderSize), uv.x);
        let fadeOutX = (1f - smoothstep((textRegionMaxX - borderSize), (textRegionMaxX + borderSize), uv.x));
        let fadeInY = smoothstep((textRegionMinY - borderSize), (textRegionMinY + borderSize), uv.y);
        let fadeOutY = (1f - smoothstep((textRegionMaxY - borderSize), (textRegionMaxY + borderSize), uv.y));
        let inTextRegion = (((fadeInX * fadeOutX) * fadeInY) * fadeOutY);
        let blendFactor = mix(0.8999999761581421f, 0.699999988079071f, inTextRegion);
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
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var bezierWriteView: texture_storage_2d<rgba16float, write>;

      @group(0) @binding(2) var<storage, read> pointsBuffer: array<vec2f, 17>;

      @group(0) @binding(3) var<storage, read> controlPointsBuffer: array<vec2f, 16>;

      fn dot2(v: vec2f) -> f32 {
        return dot(v, v);
      }

      fn sdBezier(point: vec2f, A: vec2f, B: vec2f, C: vec2f) -> f32 {
        var a = (B - A);
        var b = ((A - (B * 2f)) + C);
        var c = (a * 2f);
        var d = (A - point);
        let dotB = max(dot(b, b), 1e-4f);
        let kk = (1f / dotB);
        let kx = (kk * dot(a, b));
        let ky = ((kk * ((2f * dot(a, a)) + dot(d, b))) / 3f);
        let kz = (kk * dot(d, a));
        var res = 0f;
        let p = (ky - (kx * kx));
        let p3 = ((p * p) * p);
        let q = ((kx * (((2f * kx) * kx) - (3f * ky))) + kz);
        var h = ((q * q) + (4f * p3));
        if ((h >= 0f)) {
          h = sqrt(h);
          var x = ((vec2f(h, -(h)) - q) * 0.5f);
          var uv = (sign(x) * pow(abs(x), vec2f(0.3333333432674408)));
          let t = clamp(((uv.x + uv.y) - kx), 0f, 1f);
          res = dot2((d + ((c + (b * t)) * t)));
        }
        else {
          let z = sqrt(-(p));
          let v = (acos((q / ((p * z) * 2f))) / 3f);
          let m = cos(v);
          let n = (sin(v) * 1.732050808f);
          var t = saturate(((vec3f((m + m), (-(n) - m), (n - m)) * z) - kx));
          res = min(dot2((d + ((c + (b * t.x)) * t.x))), dot2((d + ((c + (b * t.y)) * t.y))));
        }
        return sqrt(res);
      }

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var size = textureDimensions(bezierWriteView);
        var pixelUV = ((vec2f(f32(x), f32(y)) + 0.5f) / vec2f(size));
        var sliderPos = vec2f((-1.0189999997615815f + (pixelUV.x * 2.108999973535538f)), (0.65f - (pixelUV.y * 0.95f)));
        var minDist = 1e+10f;
        var closestSegment = 0i;
        var closestT = 0f;
        const epsilon = 0.029999999329447746f;
        var xOffset = vec2f(epsilon, 0f);
        var yOffset2 = vec2f(0f, epsilon);
        var xPlusDist = 1e+10f;
        var xMinusDist = 1e+10f;
        var yPlusDist = 1e+10f;
        var yMinusDist = 1e+10f;
        for (var i = 0; (i < 16i); i++) {
          let A = (&pointsBuffer[i]);
          let B = (&pointsBuffer[(i + 1i)]);
          let C = (&controlPointsBuffer[i]);
          let dist = sdBezier(sliderPos, (*A), (*C), (*B));
          if ((dist < minDist)) {
            minDist = dist;
            closestSegment = i;
            var AB = ((*B) - (*A));
            var AP = (sliderPos - (*A));
            let ABLength = length(AB);
            if ((ABLength > 0f)) {
              closestT = clamp((dot(AP, AB) / (ABLength * ABLength)), 0f, 1f);
            }
            else {
              closestT = 0f;
            }
          }
          xPlusDist = min(xPlusDist, sdBezier((sliderPos + xOffset), (*A), (*C), (*B)));
          xMinusDist = min(xMinusDist, sdBezier((sliderPos - xOffset), (*A), (*C), (*B)));
          yPlusDist = min(yPlusDist, sdBezier((sliderPos + yOffset2), (*A), (*C), (*B)));
          yMinusDist = min(yMinusDist, sdBezier((sliderPos - yOffset2), (*A), (*C), (*B)));
        }
        let overallProgress = ((f32(closestSegment) + closestT) / 16f);
        let normalX = ((xPlusDist - xMinusDist) / (2f * epsilon));
        let normalY = ((yPlusDist - yMinusDist) / (2f * epsilon));
        textureStore(bezierWriteView, vec2u(x, y), vec4f(minDist, overallProgress, normalX, normalY));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
