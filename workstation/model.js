import * as T from '../vendor/three/three.module.min.js';
import { createMaterials, roundedBox, manifoldGeometry } from './surfaces.js?v=21';
import { tabletShell, instrumentCase, taskLamp, ribbonSupport } from './forms.js?v=21';
import { addWallArt } from './wall-art.js?v=21';
import { contactShadow } from './contact.js?v=21';
import { createWindowSky } from './sky.js?v=21';

// 原创程序几何。各物件独立成组，后续区域镜头可直接使用 anchors / focus。
export function buildWorkstation(scene, { onChange = () => {} } = {}) {
  const root = new T.Group();
  scene.add(root);
  const materials = createMaterials();
  const hitTargets = [],
    anchors = {};
  function box(parent, name, dims, pos, material, radius = 0.035) {
    const geometry =
      Math.min(...dims) > 0.03 && !/wall|floor|hit|tick|glass/.test(name)
        ? roundedBox(...dims, radius)
        : new T.BoxGeometry(...dims);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.castShadow = !/glass/.test(name);
    mesh.receiveShadow = !/glass/.test(name);
    parent.add(mesh);
    return mesh;
  }
  function rod(parent, a, b, radius, material) {
    const av = new T.Vector3(...a),
      bv = new T.Vector3(...b),
      dir = bv.clone().sub(av);
    const m = new T.Mesh(new T.CylinderGeometry(radius, radius, dir.length(), 20), material);
    m.position.copy(av.add(bv).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function texture(draw, w = 1024, h = 640) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  function label(parent, text, x, y, z, width = 1.2, color = '#c2cbbf') {
    const tex = texture(
      (c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.fillStyle = color;
        c.font = '34px monospace';
        c.fillText(text, 2, 53);
      },
      512,
      80,
    );
    const mesh = new T.Mesh(
      new T.PlaneGeometry(width, (width * 80) / 512),
      new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function curve(parent, points, radius, material, closed = false) {
    const path = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      closed,
    );
    const mesh = new T.Mesh(new T.TubeGeometry(path, 48, radius, 8, closed), material);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function fastener(parent, x, y, z, radius = 0.035) {
    const screw = new T.Mesh(new T.CylinderGeometry(radius, radius, 0.018, 12), materials.titanium);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, y, z);
    parent.add(screw);
    box(parent, 'screw-slot', [radius * 0.9, 0.009, 0.004], [x, y, z + 0.011], materials.dark);
  }
  function hit(id, parent, dims, pos) {
    const m = box(parent, id + '-hit', dims, pos, new T.MeshBasicMaterial({ visible: false }));
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.action = id;
    hitTargets.push(m);
    anchors[id] = new T.Object3D();
    anchors[id].position.set(...pos);
    parent.add(anchors[id]);
  }
  // 暗部建筑与细线分缝，避免成为独立的照片背景。
  box(root, 'back-wall', [17, 9, 0.2], [0, 3, -3.6], materials.graphite);
  box(root, 'left-wall', [0.22, 9, 10], [-7, 3, 0], materials.dark);
  box(root, 'right-wall', [0.22, 9, 10], [7, 3, 0], materials.dark);
  box(root, 'floor', [17, 0.1, 14], [0, -1, 0], materials.dark);
  for (const x of [-6.2, -4.2, 4.8, 6.3])
    box(root, 'wall-joint', [0.035, 9, 0.018], [x, 3, -3.48], materials.dark);
  // Recessed wall panels, reveal shadows and structural edge caps.
  for (const x of [-4.65, 5.8]) {
    box(root, 'service-pier', [0.34, 7.8, 0.3], [x, 3, -3.26], materials.graphite);
    box(root, 'pier-edge', [0.025, 7.8, 0.045], [x - 0.13, 3, -3.08], materials.satin);
  }
  for (const y of [0.7, 6.72]) {
    box(root, 'wall-reveal', [13.2, 0.065, 0.12], [0, y, -3.39], materials.dark);
    box(root, 'reveal-edge', [13.2, 0.018, 0.13], [0, y + 0.05, -3.38], materials.satin);
  }
  const divider = box(
    root,
    'green-divider',
    [1.55, 6.3, 0.06],
    [-5.85, 3.4, -3.35],
    materials.green,
  );
  label(root, 'ZH / 03', -6.25, 5.55, -3.3, 1.15);
  label(root, 'RESEARCH', -6.25, 5.22, -3.3, 1.15);
  label(root, 'LIFE / MATERIAL', -6.2, 1.8, -3.3, 1.3);

  // 正前方的天空开口，仍然身处地面，远处只有低矮设施与地平线。
  box(root, 'window-surround', [8.0, 4.35, 0.18], [0.5, 4.45, -3.37], materials.dark);
  for (const x of [-3.45, 4.45]) {
    box(root, 'window-jamb', [0.11, 4.36, 0.26], [x, 4.45, -3.14], materials.satin);
    box(
      root,
      'window-gasket',
      [0.028, 4.08, 0.08],
      [x + (x < 0 ? 0.08 : -0.08), 4.45, -3.02],
      materials.rubber,
    );
  }
  for (const y of [2.43, 6.47])
    box(root, 'window-frame', [7.9, 0.09, 0.23], [0.5, y, -3.12], materials.satin);
  const windowSky = createWindowSky();
  const skyMat = new T.MeshBasicMaterial({ map: windowSky.texture, toneMapped: false });
  const sky = new T.Mesh(new T.PlaneGeometry(7.65, 4.0), skyMat);
  sky.position.set(0.5, 4.45, -3.23);
  root.add(sky);
  box(root, 'sill', [8.1, 0.13, 0.62], [0.5, 2.35, -3.07], materials.graphite);
  box(root, 'sill-edge', [8.05, 0.023, 0.032], [0.5, 2.39, -2.75], materials.titanium);
  box(root, 'window-mullion', [0.065, 4.0, 0.06], [-1.92, 4.45, -3.13], materials.titanium);
  box(root, 'window-crossbar', [7.7, 0.055, 0.06], [0.5, 3.2, -3.13], materials.graphite);
  label(root, '35.68 N / 139.76 E', 2.5, 2.12, -3.27, 1.6, '#85978f');
  const drawSky = (a) => windowSky.draw(a);

  // 平整台面；窄幅象牙白薄边呼应实验室的档案卡片。
  box(root, 'desk', [11.8, 0.18, 4.7], [0, 1.1, 0.35], materials.desk, 0.085);
  box(root, 'desk-front-edge', [11.7, 0.028, 0.045], [0, 1.07, 2.7], materials.satin);
  box(root, 'desk-edge-gasket', [11.68, 0.018, 0.045], [0, 1.025, 2.69], materials.dark);
  box(root, 'desk-underframe', [11.0, 0.3, 3.5], [0, 0.88, 0.2], materials.dark);
  for (const x of [-5.1, 5.1])
    box(root, 'desk-support', [0.16, 2, 3.1], [x, 0.05, 0.15], materials.titanium);
  box(root, 'rear-service-rail', [11.7, 0.24, 0.2], [0, 1.6, -2.03], materials.satin);
  box(root, 'service-rail-inlay', [11.55, 0.12, 0.02], [0, 1.61, -1.916], materials.ivory);
  for (const x of [-4.9, -1.5, 2.4, 4.9])
    box(root, 'service-joint', [0.025, 0.24, 0.22], [x, 1.6, -2.02], materials.titanium);
  label(root, 'WS-03 / PERSONAL STATION', -1.45, 1.61, -1.9, 2.5, '#35423e');
  box(root, 'desk-mat', [4.2, 0.028, 2.73], [0.02, 1.207, 0.9], materials.rubber, 0.012);
  for (const z of [-0.38, 2.18])
    box(root, 'mat-seam', [4, 0.006, 0.008], [0.02, 1.224, z], materials.satin);
  contactShadow(root, {
    x: 0,
    z: 0.73,
    y: 1.224,
    width: 2.95,
    depth: 1.54,
    radius: 0.15,
    blur: 0.17,
    opacity: 0.44,
  });
  contactShadow(root, {
    x: 0,
    z: 1.61,
    y: 1.225,
    width: 2.74,
    depth: 0.045,
    radius: 0.02,
    blur: 0.045,
    opacity: 0.78,
  });
  contactShadow(root, {
    x: -3.65,
    z: -0.92,
    width: 1.55,
    depth: 1.2,
    radius: 0.12,
    blur: 0.12,
    opacity: 0.8,
  });
  contactShadow(root, {
    x: -2.65,
    z: 0.12,
    width: 0.69,
    depth: 0.69,
    radius: 0.345,
    blur: 0.075,
    opacity: 0.85,
  });
  contactShadow(root, {
    x: -1.92,
    z: 1.4,
    width: 0.57,
    depth: 0.57,
    radius: 0.285,
    blur: 0.06,
    opacity: 0.72,
  });
  contactShadow(root, {
    x: 2.82,
    z: 1.04,
    width: 1.88,
    depth: 1.9,
    radius: 0.08,
    blur: 0.12,
    opacity: 0.5,
  });
  contactShadow(root, {
    x: 4.55,
    z: -1,
    width: 1.97,
    depth: 1.58,
    radius: 0.12,
    blur: 0.12,
    opacity: 0.75,
  });

  // 和复习区共用“薄边深色屏”的形态；贴图仅在创建时绘制。
  const tablet = new T.Group();
  tablet.position.set(0, 1.66, 0.75);
  tablet.rotation.x = -1.14;
  root.add(tablet);
  const screenTex = texture(
    (c, w, h) => {
      c.fillStyle = '#172023';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4d5b58';
      c.lineWidth = 1;
      // The cover glass supplies the outside edge; keep the screen face unframed.
      c.fillStyle = '#99aaa1';
      c.font = '19px monospace';
      c.fillText('ZHIXU / PERSONAL RESEARCH', 60, 70);
      c.fillText('03 / WORKSTATION', 720, 70);
      c.fillStyle = '#e3e8de';
      c.font = '58px sans-serif';
      c.fillText('好奇心，仍在继续。', 60, 172);
      c.font = '21px sans-serif';
      c.fillStyle = '#a2afa6';
      c.fillText('今日  /  专注  /  随手记', 62, 223);
      c.strokeStyle = '#354640';
      c.beginPath();
      c.moveTo(60, 260);
      c.lineTo(960, 260);
      c.stroke();
      c.font = '20px monospace';
      c.fillText('MATERIAL / LIFE / BEYOND', 60, 320);
      c.fillStyle = '#cbd2c9';
      c.font = '30px sans-serif';
      c.fillText('从一个问题开始', 60, 375);
      c.fillStyle = '#8b9c92';
      c.font = '20px sans-serif';
      c.fillText('打开个人终端  ↗', 60, 460);
      c.strokeStyle = '#8a9c90';
      c.lineWidth = 1.2;
      for (let j = 0; j < 14; j++) {
        c.beginPath();
        for (let i = 0; i <= 100; i++) {
          const t = (i / 100) * Math.PI * 2,
            x = 790 + (110 + j * 0.9) * Math.cos(t),
            y = 395 + 55 * Math.sin(t) * Math.cos(j * 0.18) + 30 * Math.cos(t) * Math.sin(j * 0.18);
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
      c.fillStyle = '#c9e755';
      c.beginPath();
      c.arc(920, 512, 4, 0, Math.PI * 2);
      c.fill();
      c.font = '15px monospace';
      c.fillStyle = '#77877f';
      c.fillText('SANDBOX / INTERFACE STUDY', 60, 540);
    },
    1100,
    650,
  );
  tabletShell(tablet, screenTex, materials);
  hit('tablet', tablet, [3.25, 2.0, 0.18], [0, 0, 0.03]);
  const stand = new T.Mesh(
    ribbonSupport(
      [
        [0, 1.245, -0.43],
        [0, 1.26, -0.1],
        [0, 1.48, 0.25],
        [0, 1.84, 0.2],
      ],
      0.65,
      0.055,
    ),
    materials.satin,
  );
  stand.castShadow = stand.receiveShadow = true;
  root.add(stand);
  box(root, 'tablet-stand-sole', [0.59, 0.018, 0.33], [0, 1.231, -0.25], materials.rubber, 0.008);
  contactShadow(root, {
    x: 0,
    z: -0.25,
    y: 1.224,
    width: 0.6,
    depth: 0.35,
    radius: 0.04,
    blur: 0.04,
    opacity: 0.8,
  });
  curve(
    root,
    [
      [1.57, 1.63, 0.74],
      [1.8, 1.38, 0.65],
      [1.86, 1.23, 0.2],
      [1.85, 1.23, -1.3],
      [1.7, 1.6, -1.9],
    ],
    0.014,
    materials.rubber,
  );

  // 少量材料试样，集中表达有机曲面和工业构件的结合。
  const specimen = new T.Group();
  specimen.position.set(-3.65, 1.21, -0.92);
  root.add(specimen);
  instrumentCase(specimen, materials, { curve, label, fastener });
  contactShadow(specimen, {
    x: 0,
    z: -0.05,
    y: 0.261,
    width: 0.7,
    depth: 0.28,
    radius: 0.13,
    blur: 0.15,
    opacity: 0.38,
  });
  const band = new T.Mesh(manifoldGeometry(), materials.ivory);
  band.position.set(0, 1.03, 0);
  band.rotation.y = -0.67;
  band.rotation.z = 0.28;
  band.castShadow = true;
  band.receiveShadow = true;
  specimen.add(band);
  curve(
    specimen,
    [
      [-0.38, 0.28, 0],
      [-0.35, 0.47, -0.08],
      [0, 0.49, -0.16],
      [0.38, 0.64, -0.14],
    ],
    0.026,
    materials.titanium,
  );
  for (const [x, y, z] of [
    [-0.35, 0.48, -0.03],
    [0.37, 0.65, -0.1],
  ]) {
    box(specimen, 'sample-clamp', [0.12, 0.16, 0.1], [x, y, z], materials.satin);
    fastener(specimen, x, y, z + 0.059, 0.025);
  }
  hit('specimen', specimen, [1.8, 2.1, 1.5], [0, 1, 0]);

  // 中性台灯，与主站的冷色主光保持相容。
  const lamp = new T.Group();
  lamp.position.set(-2.65, 1.22, 0.12);
  root.add(lamp);
  const glow = taskLamp(lamp, materials, { curve, fastener });
  const taskLight = new T.SpotLight('#e8dfca', 19, 7, Math.PI * 0.35, 1, 2);
  taskLight.position.set(-2.05, 2.79, -0.38);
  taskLight.target.position.set(-1.5, 1.2, 0.6);
  root.add(taskLight, taskLight.target);
  hit('lamp', lamp, [1.65, 1.95, 0.65], [0.35, 0.92, -0.3]);
  const cup = new T.Group();
  cup.position.set(-1.92, 1.2, 1.4);
  root.add(cup);
  const coaster = new T.Mesh(new T.CylinderGeometry(0.285, 0.285, 0.025, 48), materials.rubber);
  coaster.position.y = 0.014;
  cup.add(coaster);
  const cupProfile = [
    [0, 0.025],
    [0.13, 0.025],
    [0.17, 0.038],
    [0.182, 0.07],
    [0.196, 0.29],
    [0.213, 0.45],
    [0.213, 0.472],
    [0.202, 0.484],
    [0.191, 0.472],
    [0.19, 0.44],
    [0.17, 0.12],
    [0.14, 0.082],
    [0, 0.082],
  ].map(([x, y]) => new T.Vector2(x, y));
  const cupShape = new T.Mesh(new T.LatheGeometry(cupProfile, 64), materials.ivory);
  cupShape.position.y = 0.025;
  cupShape.castShadow = true;
  cupShape.receiveShadow = true;
  cup.add(cupShape);
  const tea = new T.Mesh(
    new T.CircleGeometry(0.18, 48),
    new T.MeshPhysicalMaterial({ color: '#152422', roughness: 0.13, metalness: 0.2, clearcoat: 1 }),
  );
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.421;
  cup.add(tea);
  curve(
    cup,
    [
      [-0.18, 0.39, 0],
      [-0.34, 0.38, 0],
      [-0.36, 0.25, 0],
      [-0.29, 0.14, 0],
      [-0.18, 0.15, 0],
    ],
    0.027,
    materials.ivory,
  );
  label(cup, 'ZH / 03', -0.08, 0.27, 0.199, 0.18, '#596b60');

  const paperTex = texture(
    (c, w, h) => {
      c.fillStyle = '#cbd0c5';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#394b46';
      c.font = '22px monospace';
      c.fillText('ZHIXU / RESEARCH NOTES', 45, 65);
      c.font = '32px sans-serif';
      c.fillText('连接材料，连接记忆', 45, 123);
      c.lineWidth = 0.7;
      c.strokeStyle = '#a8b2a5';
      c.strokeRect(24, 28, w - 48, h - 51);
      c.font = '11px monospace';
      c.fillText('FIELD / 001', 366, 65);
      c.fillStyle = '#758875';
      c.fillRect(45, 144, 421, 2);
      c.strokeStyle = '#6c7b70';
      for (let j = 0; j < 9; j++) {
        c.beginPath();
        c.moveTo(45, 180 + j * 22);
        c.lineTo(320 + (j % 3) * 50, 180 + j * 22);
        c.stroke();
      }
      for (let j = 0; j < 9; j++) {
        c.beginPath();
        for (let i = 0; i < 100; i++) {
          const t = (i / 99) * Math.PI * 2,
            x = 275 + (90 + j * 3) * Math.cos(t),
            y = 485 + 45 * Math.sin(t) * Math.cos(j * 0.25);
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
      c.font = '15px monospace';
      c.fillText('MATERIAL / COMPUTATION / LIFE', 45, 600);
      c.font = '11px monospace';
      c.fillText('RESEARCH LOG    —    ZH-03', 45, 632);
    },
    512,
    660,
  );
  const report = new T.Group();
  report.position.set(2.82, 1.22, 1.04);
  report.rotation.y = -0.14;
  root.add(report);
  box(report, 'report-folder', [1.83, 0.025, 2.16], [0, 0.013, 0], materials.green, 0.009);
  for (let i = 0; i < 5; i++) {
    const g = new T.PlaneGeometry(1.7, 2.05, 20, 24);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let n = 0; n < pos.count; n++) {
      const x = pos.getX(n),
        z = pos.getZ(n);
      const curl =
        Math.pow(Math.max(0, (x + 0.85) / 1.7), 8) *
        (0.025 + i * 0.005) *
        (0.4 + 0.6 * Math.pow((z + 1.025) / 2.05, 2));
      pos.setY(n, curl + 0.003 * Math.sin(z * 5 + i));
    }
    g.computeVertexNormals();
    const material =
      i === 4
        ? new T.MeshStandardMaterial({
            map: paperTex,
            roughness: 0.97,
            bumpMap: materials.paper.bumpMap,
            bumpScale: 0.002,
            side: T.DoubleSide,
          })
        : materials.paper;
    const sheet = new T.Mesh(g, material);
    sheet.position.set(i * 0.008, 0.035 + i * 0.006, 0);
    sheet.rotation.y = (i - 2) * 0.008;
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    report.add(sheet);
  }
  box(report, 'binder-clip', [0.22, 0.09, 0.16], [-0.63, 0.1, -0.96], materials.dark);
  curve(
    report,
    [
      [-0.71, 0.14, -0.96],
      [-0.71, 0.19, -0.79],
      [-0.56, 0.19, -0.79],
      [-0.56, 0.14, -0.96],
    ],
    0.009,
    materials.titanium,
  );
  const pen = new T.Group();
  pen.position.set(0.66, 0.13, -0.05);
  pen.rotation.x = Math.PI / 2;
  pen.rotation.z = -0.055;
  report.add(pen);
  rod(pen, [0, -0.45, 0], [0, 0.44, 0], 0.024, materials.satin);
  const nib = new T.Mesh(new T.ConeGeometry(0.023, 0.095, 24), materials.titanium);
  nib.position.y = 0.48;
  pen.add(nib);
  for (let i = 0; i < 6; i++) {
    const ring = new T.Mesh(new T.TorusGeometry(0.025, 0.002, 6, 24), materials.titanium);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.24 + i * 0.023;
    pen.add(ring);
  }
  curve(
    pen,
    [
      [0, -0.39, 0.018],
      [0, -0.4, 0.04],
      [0, -0.18, 0.045],
      [0, -0.15, 0.028],
    ],
    0.006,
    materials.titanium,
  );
  hit('report', report, [1.9, 0.3, 2.2], [0, 0.12, 0]);

  // 纸飞机与希可的空置休息位：保留生活尺度，不臆造角色资产。
  const plane = new T.Group();
  plane.position.set(2.95, 2.47, -2.93);
  plane.rotation.y = 0.23;
  root.add(plane);
  const pg = new T.BufferGeometry();
  pg.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [
        0, 0, 0.4, -0.62, 0.08, -0.4, -0.06, 0.16, -0.2, 0, 0, 0.4, 0.62, 0.08, -0.4, 0.06, 0.16,
        -0.2, 0, 0, 0.4, -0.06, 0.16, -0.2, 0, 0.02, -0.38, 0, 0, 0.4, 0, 0.02, -0.38, 0.06, 0.16,
        -0.2,
      ],
      3,
    ),
  );
  pg.computeVertexNormals();
  const pm = materials.paper.clone();
  pm.side = T.DoubleSide;
  const paperPlane = new T.Mesh(pg, pm);
  paperPlane.castShadow = true;
  plane.add(paperPlane);
  hit('sky', plane, [1.45, 0.55, 1.2], [0, 0.2, 0]);
  const home = new T.Group();
  home.position.set(4.55, 1.2, -1.0);
  root.add(home);
  box(home, 'nook-back', [1.55, 0.98, 0.1], [0, 0.49, -0.6], materials.graphite);
  box(home, 'nook-top', [1.65, 0.1, 1.3], [0, 0.96, 0], materials.graphite, 0.048);
  for (const x of [-0.79, 0.79])
    box(home, 'nook-side', [0.1, 0.98, 1.3], [x, 0.49, 0], materials.graphite, 0.045);
  box(home, 'nook-trim', [1.56, 0.02, 0.03], [0, 0.98, 0.64], materials.titanium);
  box(home, 'nook-cushion', [1.4, 0.22, 1.1], [0, 0.15, 0], materials.fabric, 0.105);
  curve(
    home,
    [
      [-0.6, 0.15, 0.46],
      [0.6, 0.15, 0.46],
      [0.64, 0.15, -0.44],
      [-0.64, 0.15, -0.44],
    ],
    0.008,
    materials.green,
    true,
  );
  for (const x of [-0.78, 0.78]) fastener(home, x, 0.86, 0.657, 0.022);
  label(home, 'XIKE / REST', -0.47, 0.84, 0.66, 0.85, '#859589');
  for (let i = 0; i < 7; i++)
    box(home, 'nook-vent', [0.08, 0.012, 0.015], [-0.3 + i * 0.1, 0.71, -0.541], materials.dark);
  const shelf = box(root, 'book-shelf', [1.7, 0.075, 1.0], [4.6, 3.95, -3.0], materials.titanium);
  for (let i = 0; i < 7; i++) {
    const book = new T.Group(),
      width = 0.12 + (i % 2) * 0.04,
      height = 0.65 + (i % 3) * 0.1;
    book.position.set(4.02 + i * 0.17, 3.99 + height / 2, -3);
    root.add(book);
    const cover = i % 3 === 0 ? materials.green : i % 3 === 1 ? materials.ivory : materials.satin;
    box(
      book,
      'folio-pages',
      [width - 0.024, height - 0.04, 0.43],
      [0, 0, 0],
      materials.paper,
      0.005,
    );
    box(book, 'folio-spine', [width, height, 0.028], [0, 0, 0.23], cover, 0.009);
    for (const x of [-width / 2, width / 2])
      box(book, 'folio-cover', [0.014, height, 0.47], [x, 0, 0], cover);
    box(
      book,
      'folio-label',
      [width * 0.6, 0.12, 0.004],
      [0, -height * 0.25, 0.247],
      materials.dark,
    );
    label(book, '0' + (i + 1), -width * 0.23, -height * 0.24, 0.252, width * 0.55, '#c2c8b9');
    for (const y of [-height * 0.37, height * 0.35])
      box(book, 'folio-band', [width * 0.8, 0.008, 0.004], [0, y, 0.248], materials.satin);
  }
  label(root, 'FIELD NOTES / 01—07', 3.87, 3.8, -2.7, 1.55, '#8c9e91');
  addWallArt(root, materials, { hit, label, onChange });
  // 稀疏的可复用结构刻度。
  for (let i = 0; i < 25; i++)
    box(
      root,
      'wall-tick',
      [i % 5 === 0 ? 0.13 : 0.06, 0.008, 0.008],
      [-4.65, 2.2 + i * 0.13, -3.3],
      materials.titanium,
    );

  return {
    root,
    hitTargets,
    anchors,
    tablet,
    drawSky,
    setLamp(on) {
      taskLight.intensity = on ? 19 : 0;
      glow.visible = on;
    },
    focus: {
      tablet: { position: [0, 3.0, 5.0], target: [0, 1.4, 0.55] },
      report: { position: [2.2, 3.6, 5.2], target: [2.5, 1.2, 0.75] },
      specimen: { position: [-2.75, 3.45, 4.4], target: [-3.6, 2.2, -0.9] },
      sky: { position: [0.5, 3.8, 4.5], target: [0.7, 4.05, -3.2] },
    },
  };
}
