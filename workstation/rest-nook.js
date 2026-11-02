import * as T from '../vendor/three/three.module.min.js';

// A small, visibly occupied rest place. All textiles are original procedural geometry.
export function furnishRestNook(home, materials, { curve, label }) {
  const cloth = materials.fabric.clone();
  cloth.color.set('#829b9b');
  cloth.side = T.DoubleSide;
  const piping = materials.fabric.clone();
  piping.color.set('#b8c6ba');
  const geometry = new T.PlaneGeometry(1, 1, 40, 42);
  const p = geometry.attributes.position;
  function fold(u, v) {
    const x = u * 1.12 - 0.12;
    const z = -0.35 + v * 1.15;
    const drape = Math.max(0, (z - 0.43) / 0.37);
    const y =
      0.284 -
      0.24 * Math.sin((drape * Math.PI) / 2) +
      Math.sin(u * 19 + v * 4) * (0.012 + drape * 0.013) +
      0.009 * Math.cos(v * 19);
    return [x, y, z];
  }
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...fold(p.getX(i), 0.5 - p.getY(i)));
  geometry.computeVertexNormals();
  const blanket = new T.Mesh(geometry, cloth);
  blanket.name = 'seeko-draped-blanket';
  blanket.castShadow = blanket.receiveShadow = true;
  home.add(blanket);
  for (const u of [-0.5, 0.5])
    curve(
      home,
      Array.from({ length: 25 }, (_, i) => fold(u, i / 24)),
      0.009,
      piping,
    );
  curve(
    home,
    Array.from({ length: 25 }, (_, i) => fold(i / 24 - 0.5, 1)),
    0.012,
    piping,
  );
  // Softly squared cushion with compressed corners, rather than another rigid box.
  const pillowGeo = new T.SphereGeometry(1, 40, 24);
  const pp = pillowGeo.attributes.position;
  const soft = (n) => Math.sign(n) * Math.pow(Math.abs(n), 0.68);
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i),
      y = pp.getY(i),
      z = pp.getZ(i);
    pp.setXYZ(i, soft(x) * 0.35, soft(y) * 0.135 * (1 - 0.18 * Math.abs(x)), soft(z) * 0.225);
  }
  pillowGeo.computeVertexNormals();
  const pillow = new T.Mesh(pillowGeo, piping);
  pillow.position.set(0.06, 0.402, -0.23);
  pillow.rotation.set(0.12, -0.2, -0.07);
  pillow.name = 'seeko-soft-pillow';
  pillow.castShadow = pillow.receiveShadow = true;
  home.add(pillow);
  curve(
    pillow,
    Array.from({ length: 41 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return [soft(Math.cos(a)) * 0.348, 0, soft(Math.sin(a)) * 0.225];
    }),
    0.007,
    cloth,
    true,
  );

  // A stitched whale mark ties the textile to Seeko without adding the character prematurely.
  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 128;
  badgeCanvas.height = 64;
  const c = badgeCanvas.getContext('2d');
  c.strokeStyle = '#d5e1d5';
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(54, 34, 30, 16, 0, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(82, 35);
  c.lineTo(108, 17);
  c.lineTo(103, 35);
  c.lineTo(114, 49);
  c.lineTo(82, 40);
  c.stroke();
  c.beginPath();
  c.moveTo(47, 17);
  c.lineTo(44, 7);
  c.moveTo(46, 11);
  c.lineTo(54, 5);
  c.stroke();
  c.fillStyle = '#d5e1d5';
  c.beginPath();
  c.arc(35, 31, 2.5, 0, Math.PI * 2);
  c.fill();
  const badgeMap = new T.CanvasTexture(badgeCanvas);
  badgeMap.colorSpace = T.SRGBColorSpace;
  const badge = new T.Mesh(
    new T.PlaneGeometry(0.34, 0.17),
    new T.MeshStandardMaterial({
      map: badgeMap,
      transparent: true,
      depthWrite: false,
      roughness: 1,
    }),
  );
  badge.position.set(-0.02, 0, 0.23);
  pillow.add(badge);
  label(home, 'SEEKO', 0.18, 0.08, 0.815, 0.29, '#c1cec0');

  const base = new T.Mesh(new T.CylinderGeometry(0.095, 0.11, 0.035, 24), materials.satin);
  base.position.set(0.57, 0.29, -0.31);
  home.add(base);
  const stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 16), materials.titanium);
  stem.position.set(0.57, 0.38, -0.31);
  home.add(stem);
  const opal = new T.MeshStandardMaterial({
    color: '#d7d0b4',
    roughness: 0.55,
    emissive: '#ffe3aa',
    emissiveIntensity: 0.65,
  });
  const shade = new T.Mesh(new T.SphereGeometry(0.085, 24, 16), opal);
  shade.scale.y = 1.25;
  shade.position.set(0.57, 0.51, -0.31);
  home.add(shade);
  const nightlight = new T.PointLight('#f6dbac', 0.6, 2.0, 2);
  nightlight.position.set(0.51, 0.53, -0.12);
  home.add(nightlight);
  return (a) => {
    nightlight.intensity = a.nightlight;
    opal.emissiveIntensity = 0.25 + a.nightlight;
  };
}
