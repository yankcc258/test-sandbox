import * as T from '../vendor/three/three.module.min.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    u = smooth(x - ix),
    v = smooth(y - iy);
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), u),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), u),
    v,
  );
}
function fractal(x, y) {
  let value = 0,
    amplitude = 0.55;
  for (let i = 0; i < 5; i++) {
    value += noise(x, y) * amplitude;
    x = x * 2.03 + 17.3;
    y = y * 2.01 + 9.2;
    amplitude *= 0.48;
  }
  return value;
}

// Fixed weather study, not a live forecast. Two scales of domain-warped cloud
// density are prepared once; Tokyo lighting only recolours this shared field.
export function cloudDensity(u, v) {
  const warp = noise(u * 3.2 + 14, v * 3.5 + 8);
  const n = fractal(u * 5.6 + warp * 1.5, v * 9.8 + warp * 0.8);
  const band = Math.exp(-Math.pow((v - 0.48 - u * 0.12) / 0.23, 2));
  const lower = smooth((n - 0.38) / 0.36) * band;
  const wisps = smooth((fractal(u * 5.5 + 40, v * 24 + warp * 2) - 0.49) / 0.3);
  return clamp(lower * 0.85 + wisps * Math.exp(-Math.pow((v - 0.26) / 0.24, 2)) * 0.28);
}

export function createWindowSky() {
  const width = 1280,
    height = 672;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const field = new Float32Array(width * height),
    shade = new Float32Array(width * height);
  // Sample at half resolution, then let the density field interpolate; this
  // avoids expensive fractal work every minute or any per-frame cloud shader.
  const fw = width / 2,
    fh = height / 2,
    coarse = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) coarse[y * fw + x] = cloudDensity(x / fw, y / fh);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = x / 2,
        sy = y / 2,
        ix = Math.floor(sx),
        iy = Math.floor(sy);
      const x1 = Math.min(ix + 1, fw - 1),
        y1 = Math.min(iy + 1, fh - 1);
      field[y * width + x] = mix(
        mix(coarse[iy * fw + ix], coarse[iy * fw + x1], sx - ix),
        mix(coarse[y1 * fw + ix], coarse[y1 * fw + x1], sx - ix),
        sy - iy,
      );
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const backlit =
        field[Math.min(height - 1, y + 7) * width + Math.min(width - 1, x + 11)] - field[i];
      shade[i] = clamp(0.52 + backlit * 2.3 - field[i] * 0.13);
    }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  function draw(a) {
    const sky = rgb(a.sky),
      horizon = rgb(a.horizon),
      key = rgb(a.key);
    const pixels = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x,
          v = y / height,
          u = x / width;
        const haze = smooth((v - 0.08) / 0.9);
        const glow = Math.exp(-Math.pow((u - 0.76) / 0.36, 2) - Math.pow((v - 0.81) / 0.22, 2));
        const d = field[i],
          alpha = d * 0.84;
        const grain = (hash(x, y) - 0.5) * 0.7;
        for (let k = 0; k < 3; k++) {
          const background = mix(sky[k], horizon[k], haze) + glow * 4;
          const shadow = mix(sky[k], horizon[k], 0.28);
          const silver = mix(horizon[k], key[k], 0.33);
          const cloud = mix(shadow, silver, shade[i]);
          pixels.data[i * 4 + k] = mix(background, cloud, alpha) + grain;
        }
        pixels.data[i * 4 + 3] = 255;
      }
    ctx.putImageData(pixels, 0, 0);
    const darkness = clamp((72 - horizon[0]) / 38);
    // Stars stay behind opaque clouds and ease in with colour, not phase jumps.
    for (let i = 0; i < 88; i++) {
      const x = Math.floor(hash(i, 77) * (width - 1)),
        y = Math.floor(hash(i, 91) * height * 0.79);
      const opacity = darkness * (0.15 + hash(i, 35) * 0.5) * Math.pow(1 - field[y * width + x], 3);
      ctx.fillStyle = `rgba(207,222,229,${opacity})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.35 + hash(i, 18) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // A low, hazy ground line gives scale without a row of skyline blocks.
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? 'rgba(17,30,35,.65)' : 'rgba(29,43,49,.36)';
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 5) {
        const u = x / width;
        ctx.lineTo(
          x,
          height * (0.962 + layer * 0.022) - noise(u * 9 + layer * 31, 5) * height * 0.014,
        );
      }
      ctx.lineTo(width, height);
      ctx.fill();
    }
    for (const [u, w, h] of [
      [0.06, 0.058, 0.012],
      [0.82, 0.045, 0.016],
      [0.9, 0.072, 0.009],
    ]) {
      const x = u * width,
        y = height * (0.986 - h);
      ctx.fillStyle = 'rgba(18,31,36,.65)';
      ctx.fillRect(x, y, w * width, height - y);
      ctx.fillStyle = `rgba(207,197,152,${0.1 + darkness * 0.22})`;
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 5 + k * 7, y + 5, 2, 1);
    }
    texture.needsUpdate = true;
  }
  return { texture, draw };
}
