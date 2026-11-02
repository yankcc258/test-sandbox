import * as T from '../vendor/three/three.module.min.js';

// Local, stationary ambient occlusion: the dense contact edge follows the
// object's actual footprint; a wider low-opacity penumbra grounds it gently.
// These small maps are made once, with no full-screen AO pass or animation.
export function roundedDistance(x, y, w, h, radius) {
  const qx = Math.abs(x) - w / 2 + radius;
  const qy = Math.abs(y) - h / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

export function contactShadow(
  parent,
  { x = 0, z = 0, y = 1.193, width, depth, radius = 0.1, blur = 0.1, opacity = 0.7 },
) {
  const size = 192,
    margin = blur * 3;
  const w = width + margin * 2,
    h = depth + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d'),
    pixels = c.createImageData(size, size);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const d = Math.max(
        0,
        roundedDistance(
          (px / (size - 1) - 0.5) * w,
          (py / (size - 1) - 0.5) * h,
          width,
          depth,
          radius,
        ),
      );
      const core = Math.exp((-d * d) / (blur * blur * 0.18));
      const soft = Math.exp((-d * d) / (blur * blur * 2));
      const i = (py * size + px) * 4;
      pixels.data[i + 3] = Math.round(255 * (core * 0.68 + soft * 0.32));
    }
  c.putImageData(pixels, 0, 0);
  const map = new T.CanvasTexture(canvas);
  const shadow = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  shadow.name = 'contact-occlusion';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, y, z);
  parent.add(shadow);
  return shadow;
}
