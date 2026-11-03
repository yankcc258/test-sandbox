// Sparse measuring references, not a room or a floating information display.
// All geometry is created once; the scene's existing render requests own timing.
export function createLabEnvironment(THREE) {
  const group = new THREE.Group();
  group.name = 'laboratory-measurement-field';
  const materials = [];
  const geometries = [];
  const viewport = { value: new THREE.Vector2(1, 1) };
  function lines(name, positions, color, opacity, order) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.labViewport = viewport;
      shader.fragmentShader = `uniform vec2 labViewport;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `vec2 labScreen = gl_FragCoord.xy / max(labViewport, vec2(1.0));
        float labEdge = smoothstep(0.0, 0.2, labScreen.x)
          * smoothstep(0.0, 0.2, 1.0 - labScreen.x)
          * smoothstep(0.0, 0.18, labScreen.y)
          * smoothstep(0.0, 0.16, 1.0 - labScreen.y);
        diffuseColor.a *= labEdge;
        #include <opaque_fragment>`,
      );
    };
    material.customProgramCacheKey = () => 'measurement-field-edge-fade-v33';
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.name = name;
    mesh.renderOrder = order;
    mesh.onBeforeRender = (renderer) => renderer.getDrawingBufferSize(viewport.value);
    group.add(mesh);
    materials.push({ value: material, opacity });
    geometries.push(geometry);
    return material;
  }
  function arc(output, radius, start, end, count, z, plane = 'xy') {
    const point = (a) =>
      plane === 'xy'
        ? [radius * Math.cos(a), radius * Math.sin(a) - 0.03, z]
        : [radius * Math.cos(a), -1.5, -0.6 + radius * Math.sin(a) * 0.55];
    for (let i = 0; i < count; i++) {
      output.push(
        ...point(start + ((end - start) * i) / count),
        ...point(start + ((end - start) * (i + 1)) / count),
      );
    }
  }
  const ring = [];
  // Open sectors preserve negative space and avoid a target surrounding the knot.
  for (const [start, end] of [
    [0.2, 1.25],
    [1.57, 2.78],
    [3.15, 4.05],
    [4.52, 5.68],
  ]) {
    arc(ring, 2.27, start, end, 24, -2.4);
  }
  arc(ring, 2.11, 0.22, 0.65, 12, -2.42);
  arc(ring, 2.11, 3.66, 4.04, 10, -2.42);
  const main = lines('broken-measurement-ring', ring, '#6f817b', 0.19, -30);
  const ticks = [];
  for (let i = 0; i < 40; i++) {
    if (i % 10 > 6) continue;
    const a = (i * Math.PI) / 20,
      outer = 2.37 + (i % 5 === 0 ? 0.07 : 0);
    ticks.push(
      2.3 * Math.cos(a),
      2.3 * Math.sin(a) - 0.03,
      -2.39,
      outer * Math.cos(a),
      outer * Math.sin(a) - 0.03,
      -2.39,
    );
  }
  lines('radial-calibration', ticks, '#8b9890', 0.2, -29);
  const cool = [];
  arc(cool, 2.28, 1.0, 1.17, 6, -2.38);
  arc(cool, 2.28, 4.77, 4.87, 4, -2.38);
  cool.push(-2.66, -0.52, -2.46, -2.66, -0.18, -2.46);
  const accent = lines('quiet-cold-reference', cool, '#92aeb3', 0.23, -28);
  const footprint = [];
  arc(footprint, 2.23, 0.08, 1.35, 24, 0, 'xz');
  arc(footprint, 2.23, 1.75, 3.05, 24, 0, 'xz');
  lines('lower-depth-reference', footprint, '#52645d', 0.16, -27);
  let visibility = -1;
  return {
    group,
    setReveal(spread, lesson = false) {
      const fade = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(spread, 0, 1), 0.12, 0.9);
      const next = (1 - fade * 0.82) * (lesson ? 0.16 : 1);
      if (Math.abs(next - visibility) < 0.0001) return;
      visibility = next;
      for (const entry of materials) entry.value.opacity = entry.opacity * visibility;
    },
    setMood(mood) {
      main.color.set(mood === 'day' ? '#7b8980' : mood === 'dusk' ? '#827f70' : '#6f817b');
      accent.color.set(mood === 'day' ? '#9aafa8' : mood === 'dusk' ? '#a6ab93' : '#92aeb3');
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const entry of materials) entry.value.dispose();
      group.clear();
    },
  };
}
