import * as THREE from 'three/webgpu';

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

export const fog = new THREE.Fog(0x0f3c37, 5, 40);

export const hemisphereLight = new THREE.HemisphereLight(
  0x0f3c37,
  0x080d10,
  100,
);
