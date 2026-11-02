import * as T from '../vendor/three/three.module.min.js';
import { roundContour, roundedFace } from './forms.js?v=26';
import { contactShadow } from './contact.js?v=26';

// Original curved resting shell, fitted upholstery and personal objects.
export function furnishRestNook(home, materials, { curve, label, box, fastener }) {
  const shellMaterial = materials.ivory.clone();
  shellMaterial.color.set('#aebcb4');
  shellMaterial.roughness = 0.48;
  const lining = materials.fabric.clone();
  lining.color.set('#49615d');
  const soft = (n) => Math.sign(n) * Math.pow(Math.abs(n), 0.68);
  function mesh(name, geo, mat, xyz) {
    const m = new T.Mesh(geo, mat);
    m.name = name;
    m.position.set(...xyz);
    m.castShadow = m.receiveShadow = true;
    home.add(m);
    return m;
  }
  function ring(w, h, r, iw, ih, ir, depth, mat, z) {
    const shape = new T.Shape(roundContour(w, h, r));
    shape.holes.push(new T.Path(roundContour(iw, ih, ir).reverse()));
    return mesh(
      'seeko-continuous-shell',
      new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        curveSegments: 12,
      }),
      mat,
      [0, 0.73, z],
    );
  }
  // One continuous rounded enclosure, with an inset textile lining and a fine
  // metal reveal. The lip and rear inset create actual edge/contact shadows.
  ring(1.94, 1.46, 0.48, 1.72, 1.24, 0.38, 1.13, shellMaterial, -0.6);
  ring(1.73, 1.25, 0.385, 1.66, 1.18, 0.35, 1.04, lining, -0.55);
  ring(1.946, 1.466, 0.483, 1.906, 1.426, 0.463, 0.018, materials.titanium, 0.55);
  mesh('seeko-padded-back', roundedFace(1.7, 1.22, 0.36), lining, [0, 0.73, -0.56]);
  for (const x of [-0.43, 0, 0.43])
    curve(
      home,
      [
        [x, 0.34, -0.546],
        [x, 0.68, -0.531],
        [x, 1.12, -0.546],
      ],
      0.004,
      materials.fabric,
    );
  box(home, 'seeko-plinth', [1.7, 0.075, 1.1], [0, 0.045, 0], materials.dark, 0.03);
  box(home, 'seeko-seat', [1.58, 0.23, 1.14], [0, 0.205, 0.035], lining, 0.11);
  curve(
    home,
    [
      [-0.69, 0.19, 0.58],
      [0, 0.19, 0.607],
      [0.69, 0.19, 0.58],
    ],
    0.007,
    materials.fabric,
  );
  contactShadow(home, { y: 0.084, z: 0.04, width: 1.62, depth: 1.18, opacity: 0.52 });
  // Recessed ambient strip, a quiet status jewel and visible captive screws.
  const strip = new T.MeshBasicMaterial({ color: '#d0ddbc' });
  curve(
    home,
    [
      [-0.57, 1.26, 0.38],
      [0, 1.29, 0.38],
      [0.57, 1.26, 0.38],
    ],
    0.009,
    strip,
  );
  for (const x of [-0.88, 0.88]) fastener(home, x, 0.57, 0.56, 0.019);
  for (let i = 0; i < 5; i++)
    box(
      home,
      'seeko-vent',
      [0.035, 0.004, 0.14],
      [0.32 + i * 0.07, 1.467, -0.28],
      materials.dark,
      0.001,
    );
  label(home, 'SEEKO / 03', 0, 0.067, 0.614, 0.57, '#b9c8b9');
  // A small side shelf separates the reading light from the sleeping surface.
  box(home, 'seeko-bedside-shelf', [0.36, 0.045, 0.48], [0.58, 0.43, -0.29], materials.satin, 0.02);
  const folio = box(
    home,
    'seeko-bedside-book',
    [0.24, 0.04, 0.33],
    [0.57, 0.472, -0.24],
    materials.paper,
    0.015,
  );
  folio.rotation.y = -0.15;
  const cover = box(
    home,
    'seeko-book-cover',
    [0.255, 0.012, 0.35],
    [0.57, 0.499, -0.24],
    materials.green,
    0.005,
  );
  cover.rotation.y = -0.15;

  const cloth = materials.fabric.clone();
  cloth.color.set('#829b9b');
  cloth.side = T.DoubleSide;
  const piping = materials.fabric.clone();
  piping.color.set('#b8c6ba');
  const geometry = new T.PlaneGeometry(1, 1, 40, 42);
  const p = geometry.attributes.position;
  function fold(u, v) {
    const x = u * 0.95 - 0.2;
    const turn = (Math.max(0, (v - 0.8) / 0.2) * Math.PI) / 2;
    const z = v <= 0.8 ? -0.35 + v * 1.05 : 0.49 + 0.15 * Math.sin(turn);
    const y =
      0.347 -
      0.19 * (1 - Math.cos(turn)) +
      Math.sin(u * 13 + v * 4) * (0.004 + turn * 0.004) +
      0.003 * Math.cos(v * 16);
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
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i),
      y = pp.getY(i),
      z = pp.getZ(i);
    pp.setXYZ(i, soft(x) * 0.36, soft(y) * 0.19 * (1 - 0.18 * Math.abs(x)), soft(z) * 0.19);
  }
  pillowGeo.computeVertexNormals();
  const pillow = new T.Mesh(pillowGeo, piping);
  pillow.position.set(-0.24, 0.51, -0.26);
  pillow.rotation.set(-0.24, -0.14, -0.07);
  pillow.name = 'seeko-soft-pillow';
  pillow.castShadow = pillow.receiveShadow = true;
  home.add(pillow);
  contactShadow(home, {
    x: -0.24,
    y: 0.346,
    z: -0.26,
    width: 0.52,
    depth: 0.25,
    radius: 0.1,
    blur: 0.07,
    opacity: 0.52,
  });
  curve(
    pillow,
    Array.from({ length: 41 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return [soft(Math.cos(a)) * 0.359, 0, soft(Math.sin(a)) * 0.19];
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
  badge.position.set(-0.02, 0, 0.193);
  pillow.add(badge);

  const base = new T.Mesh(new T.CylinderGeometry(0.095, 0.11, 0.035, 24), materials.satin);
  base.position.set(0.6, 0.525, -0.38);
  home.add(base);
  const stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 16), materials.titanium);
  stem.position.set(0.6, 0.615, -0.38);
  home.add(stem);
  const opal = new T.MeshStandardMaterial({
    color: '#d7d0b4',
    roughness: 0.55,
    emissive: '#ffe3aa',
    emissiveIntensity: 0.65,
  });
  const shade = new T.Mesh(new T.SphereGeometry(0.085, 24, 16), opal);
  shade.scale.y = 1.25;
  shade.position.set(0.6, 0.745, -0.38);
  home.add(shade);
  const nightlight = new T.PointLight('#f6dbac', 0.6, 2.0, 2);
  nightlight.position.set(0.43, 0.84, 0.06);
  home.add(nightlight);
  return (a) => {
    nightlight.intensity = a.nightlight;
    opal.emissiveIntensity = 0.25 + a.nightlight;
  };
}
