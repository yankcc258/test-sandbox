// A quiet, fixed instrument bay behind the rotating observation object.
// Geometry is built once; visibility follows the existing release animation.
export function createLabEnvironment(THREE) {
  const group = new THREE.Group();
  group.name = 'laboratory-instrument-bay';
  const materials = [];
  const geometries = new Set();
  const viewport = { value: new THREE.Vector2(1, 1) };
  const edgeFaded = new Set();
  function softenCanvasEdges(finish) {
    edgeFaded.add(finish);
    finish.onBeforeCompile = (shader) => {
      shader.uniforms.labViewport = viewport;
      shader.fragmentShader = `uniform vec2 labViewport;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `vec2 labScreen = gl_FragCoord.xy / max(labViewport, vec2(1.0));
        float labSide = smoothstep(0.0, 0.22, labScreen.x)
          * smoothstep(0.0, 0.22, 1.0 - labScreen.x);
        float labVertical = smoothstep(0.0, 0.25, labScreen.y)
          * smoothstep(0.0, 0.16, 1.0 - labScreen.y);
        diffuseColor.a *= labSide * labVertical;
        #include <opaque_fragment>`,
      );
    };
    finish.customProgramCacheKey = () => 'instrument-bay-edge-fade-v1';
  }
  function material(options, basic = false) {
    const value = new (basic ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial)({
      transparent: true,
      depthWrite: false,
      ...options,
    });
    materials.push({ value, opacity: value.opacity });
    return value;
  }
  const wall = material({ color: '#182023', roughness: 0.91, metalness: 0.08, opacity: 0.85 });
  const floor = material({ color: '#141b1d', roughness: 0.88, metalness: 0.12, opacity: 0.16 });
  const recess = material({ color: '#080e10', roughness: 0.96, opacity: 0.78 });
  const graphite = material({ color: '#26302f', roughness: 0.68, metalness: 0.34, opacity: 0.86 });
  const titanium = material({ color: '#56615d', roughness: 0.57, metalness: 0.7, opacity: 0.72 });
  const ceramic = material({ color: '#8c8e80', roughness: 0.73, metalness: 0.05, opacity: 0.52 });
  const fastener = material({ color: '#717b73', roughness: 0.49, metalness: 0.74, opacity: 0.7 });
  const diffuser = material({ color: '#839e9e', opacity: 0.38, toneMapped: false }, true);
  const contact = material({ color: '#010607', opacity: 0.11 }, true);
  // Architecture blends back into the transparent canvas instead of ending in
  // a rectangular color patch beside the HTML. Screen-space falloff also works
  // when the lesson reduces the viewport; no geometry or texture is rebuilt.
  for (const finish of [wall, floor, recess]) softenCanvasEdges(finish);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  const transform = new THREE.Object3D();
  function instances(name, geometry, finish, poses, order) {
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, finish, poses.length);
    mesh.name = name;
    mesh.renderOrder = order;
    // The room never contributes a moving shadow to the specimen or ribbon.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (edgeFaded.has(finish)) {
      mesh.onBeforeRender = (renderer) => renderer.getDrawingBufferSize(viewport.value);
    }
    poses.forEach(({ p, s, r = [0, 0, 0] }, index) => {
      transform.position.set(...p);
      transform.scale.set(...s);
      transform.rotation.set(...r);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  const box = (p, s) => ({ p, s });

  // Only three large panels: the seams describe construction, not a graphic grid.
  instances(
    'graphite-wall-panels',
    cube,
    wall,
    [
      box([-3.66, 1.08, -3.57], [3.1, 5.32, 0.12]),
      box([0, 1.08, -3.59], [4.18, 5.32, 0.12]),
      box([3.66, 1.08, -3.57], [3.1, 5.32, 0.12]),
    ],
    -30,
  );
  instances(
    'wall-recesses',
    cube,
    recess,
    [
      box([-2.1, 1.08, -3.58], [0.025, 5.32, 0.08]),
      box([2.1, 1.08, -3.58], [0.025, 5.32, 0.08]),
      box([0, -1.34, -3.49], [10.4, 0.024, 0.025]),
      box([-2.43, 0.72, -3.46], [0.095, 1.62, 0.035]),
    ],
    -29,
  );
  // Below the complete folded trefoil. The separate specimen contact plane in
  // scene.js stays at -0.864 and is not replaced by an opaque floor here.
  instances('instrument-bay-floor', cube, floor, [box([0, -1.61, -0.9], [11.5, 0.06, 9.6])], -28);

  // A fixed-height measuring column and shorter sliding carriage. The open top
  // keeps the sculpture's silhouette from acquiring a rectangular picture frame.
  instances(
    'instrument-frame-channels',
    cube,
    graphite,
    [
      box([-2.18, 0.23, -2.66], [0.115, 3.5, 0.135]),
      box([2.04, -0.33, -2.66], [0.115, 2.38, 0.135]),
      box([-1.48, 1.95, -2.66], [1.51, 0.12, 0.135]),
      box([0, -1.26, -2.66], [4.46, 0.1, 0.135]),
      box([-2.18, -1.53, -2.65], [0.43, 0.1, 0.52]),
      box([2.04, -1.53, -2.65], [0.43, 0.1, 0.52]),
      box([-2.18, 1.95, -2.59], [0.19, 0.19, 0.035]),
      box([-2.18, -1.26, -2.59], [0.19, 0.18, 0.035]),
      box([2.04, -1.26, -2.59], [0.19, 0.18, 0.035]),
      box([2.04, 0.57, -2.59], [0.2, 0.29, 0.095]),
    ],
    -25,
  );
  instances(
    'exposed-titanium-tracks',
    cube,
    titanium,
    [
      box([-2.162, 0.22, -2.578], [0.021, 3.26, 0.012]),
      box([2.058, -0.34, -2.578], [0.021, 2.16, 0.012]),
      box([-1.49, 1.978, -2.578], [1.29, 0.018, 0.012]),
      box([0, -1.237, -2.578], [4.15, 0.018, 0.012]),
      box([1.93, 0.57, -2.565], [0.23, 0.043, 0.025]),
      box([-2.18, -1.47, -2.65], [0.22, 0.026, 0.28]),
      box([2.04, -1.47, -2.65], [0.22, 0.026, 0.28]),
    ],
    -24,
  );
  instances(
    'carriage-ceramic-isolators',
    cube,
    ceramic,
    [
      box([2.04, 0.7, -2.575], [0.16, 0.028, 0.1]),
      box([2.04, 0.44, -2.575], [0.16, 0.028, 0.1]),
      box([-0.75, 1.95, -2.66], [0.027, 0.1, 0.115]),
    ],
    -23,
  );

  const bolt = new THREE.CylinderGeometry(1, 1, 1, 10);
  const fasteners = [];
  for (const [x, y] of [
    [-2.18, 1.95],
    [-2.18, -1.26],
    [2.04, -1.26],
  ]) {
    for (const dx of [-0.056, 0.056]) {
      fasteners.push({ p: [x + dx, y, -2.562], s: [0.013, 0.009, 0.013], r: [Math.PI / 2, 0, 0] });
    }
  }
  fasteners.push({ p: [2.04, 0.57, -2.531], s: [0.021, 0.018, 0.021], r: [Math.PI / 2, 0, 0] });
  instances('frame-fasteners', bolt, fastener, fasteners, -22);

  // Engraved physical scale: each fifth step is longer. All ticks stay attached
  // to the actual column and carriage rather than floating beside the object.
  const tickPositions = [];
  for (let i = 0; i <= 30; i++) {
    const y = -1.17 + i * 0.1;
    const length = i % 5 === 0 ? 0.047 : 0.025;
    tickPositions.push(-2.213, y, -2.588, -2.213 + length, y, -2.588);
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
  geometries.add(tickGeometry);
  const tickMaterial = new THREE.LineBasicMaterial({
    color: '#82918b',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  materials.push({ value: tickMaterial, opacity: tickMaterial.opacity });
  const ticks = new THREE.LineSegments(tickGeometry, tickMaterial);
  ticks.name = 'column-calibration';
  ticks.renderOrder = -21;
  group.add(ticks);

  instances(
    'recessed-light-diffuser',
    cube,
    diffuser,
    [
      box([-2.43, 0.72, -3.433], [0.015, 1.48, 0.009]),
      box([1.89, 0.57, -2.545], [0.018, 0.028, 0.006]),
    ],
    -20,
  );

  // Layered soft elliptical footprints bind the measuring frame to the floor;
  // no canvas textures, animated lights, or additional shadow maps are needed.
  const disk = new THREE.CircleGeometry(1, 32);
  const contacts = [];
  for (const x of [-2.18, 2.04]) {
    for (let ring = 0; ring < 3; ring++) {
      contacts.push({
        p: [x, -1.578 + ring * 0.0003, -2.65],
        s: [0.32 - ring * 0.06, 0.35 - ring * 0.06, 1],
        r: [-Math.PI / 2, 0, 0],
      });
    }
  }
  instances('frame-floor-contact', disk, contact, contacts, -27);

  let visibility = -1;
  return {
    group,
    setReveal(spread, lesson = false) {
      const fade = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(spread, 0, 1), 0.12, 0.9);
      const next = (1 - fade * 0.9) * (lesson ? 0.18 : 1);
      if (Math.abs(next - visibility) < 0.0001) return;
      visibility = next;
      for (const entry of materials) entry.value.opacity = entry.opacity * visibility;
    },
    setMood(mood) {
      diffuser.color.set(mood === 'day' ? '#91a8a3' : mood === 'dusk' ? '#9b9e8c' : '#78969c');
      wall.color.set(mood === 'day' ? '#1c2425' : mood === 'dusk' ? '#201f1d' : '#182023');
      floor.color.set(mood === 'day' ? '#1c2322' : mood === 'dusk' ? '#211f1b' : '#141b1d');
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const entry of materials) entry.value.dispose();
      group.clear();
    },
  };
}
