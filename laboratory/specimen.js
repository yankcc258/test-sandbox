// Original mathematical specimen. The visible top surface is exactly
// y = (u² - v²) / 2; the ceramic thickness lies below that surface.
export const SPECIMEN_BOUND = 1.2;
export const surfacePoint = (u, v) => [u, (u * u - v * v) / 2, v];
export const tangentY = (x, z, a, b) => (a * a - b * b) / 2 + a * (x - a) - b * (z - b);

// Each returned array is one connected component. Never join the two branches
// of a hyperbola through the empty space between them.
export function sectionPoints(level, steps = 64) {
  if (!Number.isFinite(level)) throw new RangeError('Section height must be finite');
  if (!Number.isInteger(steps) || steps < 2) throw new RangeError('At least two steps required');
  const bound = SPECIMEN_BOUND;
  if (Math.abs(level) > (bound * bound) / 2) return [];
  if (level === 0) {
    return [-1, 1].map((sign) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const x = -bound + (2 * bound * i) / steps;
        return [x, 0, sign * x];
      }),
    );
  }
  const limit = Math.sqrt(Math.max(0, bound * bound - 2 * Math.abs(level)));
  return [-1, 1].map((sign) =>
    Array.from({ length: limit < 1e-12 ? 1 : steps + 1 }, (_, i) => {
      const t = -limit + (2 * limit * i) / steps;
      const q = sign * Math.sqrt(t * t + 2 * Math.abs(level));
      return level > 0 ? [q, level, t] : [t, level, q];
    }),
  );
}

export function createSpecimen(T) {
  const group = new T.Group();
  group.name = 'mathematics-specimen';
  const display = new T.Group();
  group.add(display);
  const materials = [];
  function material(type, props) {
    const m = new T[type]({ ...props, transparent: true });
    m.userData.revealOpacity = props.opacity ?? 1;
    m.userData.revealDepthWrite = props.depthWrite ?? m.userData.revealOpacity > 0.8;
    materials.push(m);
    return m;
  }
  const ivory = material('MeshPhysicalMaterial', {
    color: '#e4e1d4',
    roughness: 0.42,
    metalness: 0.03,
    clearcoat: 0.23,
    clearcoatRoughness: 0.5,
    sheen: 0.18,
    side: T.DoubleSide,
  });
  const underside = material('MeshStandardMaterial', {
    color: '#aeb3ac',
    roughness: 0.51,
    metalness: 0.18,
  });
  const titanium = material('MeshStandardMaterial', {
    color: '#8d999b',
    roughness: 0.3,
    metalness: 0.72,
  });
  const titaniumDark = material('MeshStandardMaterial', {
    color: '#343e40',
    roughness: 0.43,
    metalness: 0.67,
  });
  const gasket = material('MeshStandardMaterial', {
    color: '#20292a',
    roughness: 0.78,
    metalness: 0.05,
  });
  const gridMaterial = material('LineBasicMaterial', {
    color: '#526668',
    opacity: 0.44,
    depthWrite: false,
  });
  const tangentMaterial = material('MeshBasicMaterial', {
    color: '#a4c6ba',
    opacity: 0.12,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const tangentLine = material('LineBasicMaterial', {
    color: '#a8c5af',
    opacity: 0.8,
    depthWrite: false,
  });
  const sectionMaterial = material('MeshBasicMaterial', {
    color: '#a9c56b',
    toneMapped: false,
  });
  const cutMaterial = material('MeshBasicMaterial', {
    color: '#8aa9a1',
    opacity: 0.035,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const cutBorder = material('LineBasicMaterial', {
    color: '#8aa9a1',
    opacity: 0.37,
    depthWrite: false,
  });

  function mesh(geometry, mat, parent = display) {
    const object = new T.Mesh(geometry, mat);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function lines(points, mat, parent = display) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
    const object = new T.LineSegments(geometry, mat);
    parent.add(object);
    return object;
  }
  const bound = SPECIMEN_BOUND,
    n = 64,
    thickness = 0.035;
  const coordinates = [],
    indices = [],
    bottomCoordinates = [],
    bottomIndices = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const p = surfacePoint(-bound + (2 * bound * i) / n, -bound + (2 * bound * j) / n);
      coordinates.push(...p);
      bottomCoordinates.push(p[0], p[1] - thickness, p[2]);
      if (i < n && j < n) {
        const a = j * (n + 1) + i,
          b = a + 1,
          c = a + n + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
        bottomIndices.push(a, b, c, b, d, c);
      }
    }
  }
  function surfaceGeometry(points, triangles) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    return geometry;
  }
  const shell = mesh(surfaceGeometry(coordinates, indices), ivory);
  shell.name = 'exact-saddle-surface';
  mesh(surfaceGeometry(bottomCoordinates, bottomIndices), underside).name = 'ceramic-underside';
  const boundary = [];
  for (let edge = 0; edge < 4; edge++) {
    const edgePoints = [];
    for (let i = 0; i <= n; i++) {
      const t = -bound + (2 * bound * i) / n;
      const [u, v] = [
        [t, -bound],
        [bound, t],
        [-t, bound],
        [-bound, -t],
      ][edge];
      const p = surfacePoint(u, v);
      edgePoints.push(new T.Vector3(...p));
      if (i < n) boundary.push(p);
    }
    const rim = new T.TubeGeometry(new T.CatmullRomCurve3(edgePoints), 64, 0.009, 5, false);
    mesh(rim, titanium).name = 'precision-edge';
  }
  const sidePositions = [],
    sideIndices = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i],
      b = boundary[(i + 1) % boundary.length],
      start = sidePositions.length / 3;
    sidePositions.push(...a, ...b, a[0], a[1] - thickness, a[2], b[0], b[1] - thickness, b[2]);
    sideIndices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }
  mesh(surfaceGeometry(sidePositions, sideIndices), titanium).material.side = T.DoubleSide;

  const gridPoints = [];
  const gridSteps = 40;
  for (let axis = 0; axis < 2; axis++) {
    for (let band = 1; band < 12; band++) {
      const fixed = -bound + (2 * bound * band) / 12;
      for (let i = 0; i < gridSteps; i++) {
        for (const k of [i, i + 1]) {
          const t = -bound + (2 * bound * k) / gridSteps;
          const p = axis ? surfacePoint(fixed, t) : surfacePoint(t, fixed);
          p[1] += 0.006;
          gridPoints.push(p);
        }
      }
    }
  }
  lines(gridPoints, gridMaterial).name = 'surface-coordinates';

  // Three discrete kinematic supports stand outside the surface boundary.
  // Feet, split collars, insulating pads and visible screw heads give the
  // abstract surface the scale of a handled physical specimen.
  const footGeometry = new T.CylinderGeometry(0.13, 0.16, 0.045, 32);
  const washerGeometry = new T.CylinderGeometry(0.085, 0.085, 0.014, 28);
  const stemGeometry = new T.CylinderGeometry(0.022, 0.026, 0.72, 16);
  const sleeveGeometry = new T.CylinderGeometry(0.043, 0.043, 0.16, 24);
  const collarGeometry = new T.TorusGeometry(0.044, 0.007, 6, 24);
  const jawGeometry = new T.BoxGeometry(0.21, 0.035, 0.14);
  const padGeometry = new T.BoxGeometry(0.11, 0.012, 0.1);
  const screwGeometry = new T.CylinderGeometry(0.025, 0.025, 0.013, 6);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [1, 1],
  ]) {
    const mount = new T.Group();
    mount.name = 'titanium-mount';
    mount.position.set(x * 1.27, 0, z * 1.27);
    mount.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
    display.add(mount);
    mesh(footGeometry, titaniumDark, mount).position.y = -0.83;
    mesh(washerGeometry, titanium, mount).position.y = -0.802;
    mesh(stemGeometry, titanium, mount).position.y = -0.425;
    mesh(sleeveGeometry, titaniumDark, mount).position.y = -0.16;
    for (const y of [-0.245, -0.075]) {
      const collar = mesh(collarGeometry, titanium, mount);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = y;
    }
    mesh(jawGeometry, titanium, mount).position.set(-x * 0.04, -0.0645, 0);
    mesh(padGeometry, gasket, mount).position.set(-x * 0.09, -0.041, 0);
    const cap = mesh(screwGeometry, titaniumDark, mount);
    cap.position.set(x * 0.072, -0.041, 0);
    const slot = mesh(new T.BoxGeometry(0.023, 0.002, 0.004), titanium, mount);
    slot.position.set(x * 0.072, -0.0335, 0);
  }

  const tangent = new T.Group();
  tangent.name = 'tangent-observation';
  display.add(tangent);
  const tangentGeometry = new T.BufferGeometry();
  tangentGeometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(12), 3));
  tangentGeometry.setIndex([0, 2, 1, 1, 2, 3]);
  const tangentPlane = mesh(tangentGeometry, tangentMaterial, tangent);
  tangentPlane.castShadow = false;
  const planeLines = lines(
    Array.from({ length: 24 }, () => [0, 0, 0]),
    tangentLine,
    tangent,
  );
  const marker = mesh(new T.SphereGeometry(0.037, 20, 12), sectionMaterial, tangent);
  const normal = lines(
    [
      [0, 0, 0],
      [0, 0.3, 0],
    ],
    tangentLine,
    tangent,
  );
  const tip = mesh(new T.SphereGeometry(0.014, 12, 8), titanium, tangent);

  const section = new T.Group();
  section.name = 'horizontal-section';
  display.add(section);
  const cutPlane = mesh(new T.PlaneGeometry(2.68, 2.68), cutMaterial, section);
  cutPlane.rotation.x = -Math.PI / 2;
  cutPlane.castShadow = false;
  const cutEdge = lines(
    [
      [-1.34, 0, -1.34],
      [1.34, 0, -1.34],
      [1.34, 0, -1.34],
      [1.34, 0, 1.34],
      [1.34, 0, 1.34],
      [-1.34, 0, 1.34],
      [-1.34, 0, 1.34],
      [-1.34, 0, -1.34],
    ],
    cutBorder,
    section,
  );

  // Constant-size tubes update only their position/normal buffers on input.
  const tubeSteps = 64,
    radialSteps = 6;
  function dynamicTube() {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array((tubeSteps + 1) * radialSteps * 3), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'normal',
      new T.BufferAttribute(new Float32Array((tubeSteps + 1) * radialSteps * 3), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    const indices = [];
    for (let i = 0; i < tubeSteps; i++)
      for (let j = 0; j < radialSteps; j++) {
        const a = i * radialSteps + j,
          b = i * radialSteps + ((j + 1) % radialSteps);
        const c = a + radialSteps,
          d = b + radialSteps;
        indices.push(a, c, b, b, c, d);
      }
    geometry.setIndex(indices);
    const object = mesh(geometry, sectionMaterial, section);
    object.frustumCulled = false;
    object.castShadow = false;
    object.renderOrder = 3;
    return object;
  }
  const contours = [dynamicTube(), dynamicTube()];
  function updateTube(object, points) {
    const pos = object.geometry.attributes.position,
      normals = object.geometry.attributes.normal;
    object.visible = points.length > 1;
    if (!object.visible) return;
    for (let i = 0; i <= tubeSteps; i++) {
      const p = points[i],
        a = points[Math.max(0, i - 1)],
        b = points[Math.min(tubeSteps, i + 1)];
      const dx = b[0] - a[0],
        dz = b[2] - a[2],
        len = Math.hypot(dx, dz) || 1;
      for (let j = 0; j < radialSteps; j++) {
        const angle = (j / radialSteps) * Math.PI * 2,
          c = Math.cos(angle),
          s = Math.sin(angle);
        const nx = (-dz / len) * c,
          nz = (dx / len) * c,
          k = i * radialSteps + j;
        pos.setXYZ(k, p[0] + nx * 0.013, p[1] + s * 0.013 + 0.005, p[2] + nz * 0.013);
        normals.setXYZ(k, nx, s, nz);
      }
    }
    pos.needsUpdate = true;
    normals.needsUpdate = true;
  }

  let mode = 'surface',
    probe = 0.35,
    reveal = 0;
  function updateProbe() {
    const a = probe,
      b = 0.3,
      extent = 0.44;
    const p = surfacePoint(a, b);
    const corners = [
      [a - extent, b - extent],
      [a + extent, b - extent],
      [a - extent, b + extent],
      [a + extent, b + extent],
    ];
    corners.forEach(([x, z], i) =>
      tangentGeometry.attributes.position.setXYZ(i, x, tangentY(x, z, a, b) + 0.008, z),
    );
    tangentGeometry.attributes.position.needsUpdate = true;
    tangentGeometry.computeVertexNormals();
    tangentGeometry.computeBoundingSphere();
    marker.position.set(p[0], p[1] + 0.026, p[2]);
    const n = new T.Vector3(-a, 1, b).normalize().multiplyScalar(0.31);
    normal.geometry.attributes.position.setXYZ(0, p[0], p[1] + 0.025, p[2]);
    normal.geometry.attributes.position.setXYZ(1, p[0] + n.x, p[1] + 0.025 + n.y, p[2] + n.z);
    normal.geometry.attributes.position.needsUpdate = true;
    normal.geometry.computeBoundingSphere();
    tip.position.set(p[0] + n.x, p[1] + 0.025 + n.y, p[2] + n.z);
    const linePoints = [];
    for (const offset of [-extent, -extent / 3, extent / 3, extent]) {
      linePoints.push(
        [a - extent, b + offset],
        [a + extent, b + offset],
        [a + offset, b - extent],
        [a + offset, b + extent],
      );
    }
    linePoints.forEach(([x, z], i) =>
      planeLines.geometry.attributes.position.setXYZ(i, x, tangentY(x, z, a, b) + 0.011, z),
    );
    planeLines.geometry.setDrawRange(0, linePoints.length);
    planeLines.geometry.attributes.position.needsUpdate = true;
    planeLines.geometry.computeBoundingSphere();
    const level = probe * 0.5;
    cutPlane.position.y = level;
    cutEdge.position.y = level;
    const curves = sectionPoints(level, tubeSteps);
    contours.forEach((object, i) => updateTube(object, curves[i] || []));
  }
  function setMode(value) {
    mode = ['surface', 'tangent', 'section'].includes(value) ? value : 'surface';
    tangent.visible = mode === 'tangent';
    section.visible = mode === 'section';
    group.userData.mode = mode;
  }
  function setProbe(value) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(-1, Math.min(1, value));
    if (next === probe) return;
    probe = next;
    group.userData.probe = probe;
    updateProbe();
  }
  function setReveal(value) {
    const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    if (next === reveal && group.visible === next > 0.001) return;
    reveal = next;
    group.visible = reveal > 0.001;
    display.scale.setScalar(0.94 + reveal * 0.06);
    for (const mat of materials) {
      mat.opacity = mat.userData.revealOpacity * reveal;
      mat.depthWrite = mat.userData.revealDepthWrite && reveal > 0.98;
    }
  }
  function dispose() {
    const geometries = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((mat) => mat.dispose());
  }
  updateProbe();
  setMode('surface');
  setReveal(0);
  group.userData.probe = probe;
  return { group, setMode, setProbe, setReveal, dispose };
}
