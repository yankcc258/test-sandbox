import * as T from '../vendor/three/three.module.min.js';

// Window projection is actual illumination: it catches the desk, objects and their shadows.
// The mask is generated once and the stationary shadow map is reused while the camera moves.
export function addWindowSun(scene, mobile) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 256, 256);
  c.filter = 'blur(2px)';
  c.fillStyle = '#fff';
  c.fillRect(36, 28, 91, 94);
  c.fillRect(134, 28, 86, 94);
  c.fillRect(36, 129, 91, 99);
  c.fillRect(134, 129, 86, 99);
  const map = new T.CanvasTexture(canvas);
  const sun = new T.SpotLight('#ffe6b8', 0, 22, 0.36, 0.25, 2);
  sun.name = 'window-sunlight';
  sun.position.set(3.5, 6.15, -2.72);
  sun.target.position.set(1.6, 1.19, 2.15);
  sun.map = map;
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  sun.shadow.camera.near = 0.2;
  sun.shadow.camera.far = 22;
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.008;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  return sun;
}
