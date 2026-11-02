import * as T from '../vendor/three/three.module.min.js';
import { profiledShell } from './forms.js?v=24';

export const ARTWORKS = [
  {
    title: '连续体',
    english: 'CONTINUUM',
    src: new URL('./art/continuum.png', import.meta.url).href,
    position: [-5.62, 3.72, -2.98],
    width: 1.72,
  },
  {
    title: '远场',
    english: 'DISTANT FIELD',
    src: new URL('./art/distant-field.png', import.meta.url).href,
    position: [6.32, 3.95, -2.98],
    width: 1.35,
  },
];

export function addWallArt(root, materials, { hit, label, onChange }) {
  const loader = new T.TextureLoader();
  for (const [i, art] of ARTWORKS.entries()) {
    const group = new T.Group(),
      w = art.width,
      h = (w * 4) / 3;
    group.position.set(...art.position);
    root.add(group);
    const fixture = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, w * 0.62, 16), materials.satin);
    fixture.rotation.z = Math.PI / 2;
    fixture.position.set(0, h / 2 + 0.15, 0.28);
    group.add(fixture);
    const arm = new T.Mesh(new T.BoxGeometry(0.035, 0.04, 0.28), materials.satin);
    arm.position.set(0, h / 2 + 0.15, 0.13);
    group.add(arm);
    const diffuser = new T.Mesh(new T.BoxGeometry(w * 0.53, 0.008, 0.025), materials.light);
    diffuser.position.set(0, h / 2 + 0.124, 0.285);
    group.add(diffuser);
    const pictureLight = new T.SpotLight('#d7e1d8', 5.5, 4.5, 0.72, 0.8, 2);
    pictureLight.position.set(0, h / 2 + 0.15, 0.55);
    pictureLight.target.position.set(0, -0.25, 0);
    group.add(pictureLight, pictureLight.target);
    const frame = new T.Mesh(
      profiledShell([
        [-0.035, w + 0.14, h + 0.14, 0.025],
        [0.01, w + 0.14, h + 0.14, 0.025],
        [0.035, w + 0.1, h + 0.1, 0.018],
      ]),
      materials.satin,
    );
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);
    const recess = new T.Mesh(new T.PlaneGeometry(w + 0.055, h + 0.055), materials.rubber);
    recess.position.z = 0.036;
    group.add(recess);
    const printMaterial = new T.MeshStandardMaterial({
      color: '#c3cbbf',
      roughness: 0.92,
      metalness: 0,
      emissive: '#292b25',
      emissiveIntensity: 0.3,
    });
    const print = new T.Mesh(new T.PlaneGeometry(w, h), printMaterial);
    print.position.z = 0.042;
    group.add(print);
    loader.load(
      art.src,
      (texture) => {
        texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = 4;
        printMaterial.map = printMaterial.emissiveMap = texture;
        printMaterial.color.set('#ffffff');
        printMaterial.needsUpdate = true;
        onChange();
      },
      undefined,
      () => console.warn('墙画加载失败：' + art.title),
    );
    label(
      group,
      '0' + (i + 1) + ' / ' + art.english,
      -w * 0.4,
      -h * 0.5 - 0.17,
      0.047,
      w * 0.8,
      '#87958c',
    );
    hit('art', group, [w + 0.14, h + 0.14, 0.12], [0, 0, 0.04]);
  }
}
