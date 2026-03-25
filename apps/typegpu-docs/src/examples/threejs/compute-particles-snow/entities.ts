import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

import * as t3 from '@typegpu/three';
import { d, std } from 'typegpu';

export const dirLight = (() => {
  const dirLight = new THREE.DirectionalLight(0xf9ff9b, 9);
  dirLight.castShadow = true;
  dirLight.position.set(10, 10, 0);
  dirLight.castShadow = true;
  Object.assign(dirLight.shadow.camera, {
    near: 1,
    far: 30,
    right: 30,
    left: -30,
    top: 30,
    bottom: -30,
  });
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.bias = -0.009;
  return dirLight;
})();

export const fog = new THREE.Fog(0x0f3c37, 4, 40);

export const hemisphereLight = new THREE.HemisphereLight(0x0f3c37, 0x080d10, 100);

export const floor = (() => {
  const floorGeometry = new THREE.PlaneGeometry(100, 100);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x800000,
      roughness: 0.5,
      metalness: 0,
      transparent: false,
    }),
  );
  floor.position.y = 0;
  floor.material.opacityNode = t3.toTSL(() => {
    'use gpu';
    const localPos = t3.fromTSL(TSL.positionLocal, d.vec3f).$;
    return std.saturate(std.length(localPos.xz * 0.05)) - 1;
  });
  floor.layers.disableAll();
  floor.layers.enable(1);
  floor.layers.enable(2);
  return floor;
})();

export const xmasTree = (() => {
  const count = 8;

  const coneMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0x004225,
    roughness: 0.6,
    metalness: 0,
  });

  const object = new THREE.Group();

  for (let i = 0; i < count; i++) {
    const radius = 1 + i;

    const coneGeometry = new THREE.ConeGeometry(radius * 0.95, radius * 1.25, 32);

    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.castShadow = true;
    cone.position.y = (count - i) * 1.5 + count * 0.6;
    object.add(cone);
  }

  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, count, 32);
  const cylinder = new THREE.Mesh(cylinderGeometry, coneMaterial);
  cylinder.position.y = count / 2;
  object.add(cylinder);

  object.layers.disableAll();
  object.layers.enable(1);
  object.layers.enable(2);

  return object;
})();

export const teapot = (() => {
  const teapot = new THREE.Mesh(
    new TeapotGeometry(0.5, 18),
    new THREE.MeshBasicNodeMaterial({
      color: 0xfcfb9e,
    }),
  );

  teapot.position.y = 18;
  teapot.layers.disableAll();
  teapot.layers.enable(1);
  teapot.layers.enable(2);

  return teapot;
})();
