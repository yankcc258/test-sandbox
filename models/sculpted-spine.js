import * as THREE from '../vendor/three/three.module.min.js';

// Purpose-built reader for our uncompressed GLB subset (positions, normals, uint32 indices).
// The asset is original geometry. No external model, texture, decoder or CDN is used.
export async function loadSculptedSpine() {
  const url = new URL('../assets/models/organic-spine-scene-v3.glb', import.meta.url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Spine model: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer(),
    view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2)
    throw new Error('Invalid spine GLB');
  const length = view.getUint32(12, true),
    bin = 28 + length;
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  const attribute = (index, width, Type) => {
    const a = data.accessors[index],
      v = data.bufferViews[a.bufferView];
    return new THREE.BufferAttribute(
      new Type(buffer, bin + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * width),
      width,
    );
  };
  const materials = data.materials.map((m, i) => {
    const p = m.pbrMetallicRoughness;
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(...p.baseColorFactor.slice(0, 3), THREE.LinearSRGBColorSpace),
      roughness: p.roughnessFactor,
      metalness: p.metallicFactor,
      clearcoat: i === 0 ? 0.4 : i === 1 ? 0.18 : 0,
      clearcoatRoughness: 0.3,
    });
  });
  const instances = new Map(),
    group = new THREE.Group(),
    units = new Set(data.extras?.units || []),
    // 椎孔中心在每节椎骨局部坐标里的位置（由模型几何量出：椎体后缘与骨弓之间）
    canalLocal = new THREE.Vector3(0, 0, -0.19),
    canal = [];
  function visit(i, parent) {
    const n = data.nodes[i],
      local = new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(n.translation || [0, 0, 0]),
        new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(n.scale || [1, 1, 1]),
      ),
      world = parent.clone().multiply(local);
    if (units.has(i)) canal.push(canalLocal.clone().applyMatrix4(world));
    if (n.mesh !== undefined) {
      if (!instances.has(n.mesh)) instances.set(n.mesh, []);
      instances.get(n.mesh).push(world);
    }
    n.children?.forEach((child) => visit(child, world));
  }
  data.scenes[data.scene || 0].nodes.forEach((i) => visit(i, new THREE.Matrix4()));
  let triangles = 0;
  for (const [index, matrices] of instances) {
    const source = data.meshes[index],
      p = source.primitives[0],
      g = new THREE.BufferGeometry();
    g.setAttribute('position', attribute(p.attributes.POSITION, 3, Float32Array));
    g.setAttribute('normal', attribute(p.attributes.NORMAL, 3, Float32Array));
    g.setIndex(attribute(p.indices, 1, Uint32Array));
    g.computeBoundingSphere();
    const mesh = new THREE.InstancedMesh(g, materials[p.material], matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.name = source.name;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    triangles += (g.index.count / 3) * matrices.length;
  }
  group.name = 'Organic spine / titanium hardware / revision 03';
  return {
    group,
    // 每节椎孔中心的世界坐标，从上到下；脊髓沿着它穿过去
    canal,
    stats: { vertebrae: data.extras.vertebrae, triangles, drawObjects: group.children.length },
  };
}
