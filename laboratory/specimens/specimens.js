import * as THREE from '../../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';
import { RECIPES } from '../specimen-recipes.js?v=40';
import { buildModelPoses, ASSEMBLY_COUNT } from '../assembly-models.js?v=40';
import { mountProbeControls } from '../probe-controls.js?v=40';
import {
  createSpecimenGeometry,
  createSpecimenMaterial,
  createSpecimenDepthMaterial,
  surfaceFor,
} from '../specimen-materials.js?v=40';

// One renderer, no permanent animation loop. Copy each completed render into
// its card; changing one recipe redraws only that card with the shared materials.
let paint = () => {};
try {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setSize(700, 500);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const room = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(room, 0.035);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  room.dispose();
  const camera = new THREE.PerspectiveCamera(34, 1.4, 0.1, 30);
  camera.position.set(0.35, 0.5, 6.2);
  camera.lookAt(0, -0.15, 0);
  const key = new THREE.DirectionalLight('#eef0e5', 2.8);
  key.position.set(-3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 16 });
  key.shadow.normalBias = 0.012;
  const rim = new THREE.DirectionalLight('#95b3bf', 1.3);
  rim.position.set(3, 1, -2);
  const fill = new THREE.DirectionalLight('#c2cecc', 0.8);
  fill.position.set(4, 1, 3);
  scene.add(key, rim, fill, new THREE.HemisphereLight('#d3ddd6', '#222a28', 0.22));
  const geometry = createSpecimenGeometry(ASSEMBLY_COUNT),
    material = createSpecimenMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, ASSEMBLY_COUNT);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.customDepthMaterial = createSpecimenDepthMaterial();
  mesh.frustumCulled = false;
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 3),
    new THREE.ShadowMaterial({ opacity: 0.25 }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.receiveShadow = true;
  scene.add(mesh, contact);
  const transform = new THREE.Object3D(),
    color = new THREE.Color();
  paint = (model, canvas) => {
    model.poses.forEach((pose, i) => {
      transform.position.fromArray(pose.position);
      transform.rotation.set(...pose.rotation);
      transform.scale.fromArray(pose.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(i, color.set(pose.color));
      geometry.getAttribute('labSurface').setXYZ(i, ...surfaceFor(pose.role));
    });
    contact.position.y = model.metadata.contactY;
    mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
    geometry.getAttribute('labSurface').needsUpdate = true;
    renderer.render(scene, camera);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(renderer.domElement, 0, 0);
  };
} catch (error) {
  document.getElementById('preview-fallback').hidden = false;
  console.warn('Specimen preview:', error);
}

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};
Object.values(RECIPES).forEach((recipe, index) => {
  const card = make('article', 'specimen-card');
  card.id = recipe.id;
  const canvas = make('canvas', '');
  canvas.width = 700;
  canvas.height = 500;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', recipe.title + '观察模型');
  const controlsRoot = make('div', '');
  const readout = make('p', 'specimen-note'),
    legend = make('p', 'specimen-legend');
  const footer = make('footer', '');
  const reset = make('button', '', '恢复原例');
  reset.type = 'button';
  const enter = make('a', '', '进入本章 →');
  enter.href = `../?v=40&chapter=${encodeURIComponent(recipe.id)}`;
  footer.append(reset, enter);
  card.append(
    make('p', 'eyebrow', `SPECIMEN / 0${index + 1}`),
    make('h2', '', recipe.title),
    canvas,
    controlsRoot,
    readout,
    legend,
    make('p', 'specimen-description', recipe.description),
    footer,
  );
  document.getElementById('specimen-grid').append(card);
  const controls = mountProbeControls(controlsRoot, render, 'preview-' + recipe.id);
  function render(value) {
    const model = buildModelPoses(recipe.id, value);
    controls.update(model, value);
    readout.textContent = model.metadata.readout;
    legend.textContent = model.metadata.legend;
    paint(model, canvas);
  }
  reset.onclick = () => render();
  render();
});
