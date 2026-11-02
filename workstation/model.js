import * as T from '../vendor/three/three.module.min.js';

// 原创程序几何。各物件独立成组，后续区域镜头可直接使用 anchors / focus。
export function buildWorkstation(scene) {
  const root = new T.Group();
  scene.add(root);
  const materials = {
    graphite: new T.MeshStandardMaterial({ color: '#20282b', roughness: 0.78, metalness: 0.12 }),
    dark: new T.MeshStandardMaterial({ color: '#101719', roughness: 0.8 }),
    ivory: new T.MeshStandardMaterial({ color: '#b7c0b4', roughness: 0.6, metalness: 0.08 }),
    titanium: new T.MeshStandardMaterial({ color: '#7d8989', roughness: 0.33, metalness: 0.75 }),
    green: new T.MeshStandardMaterial({ color: '#314b45', roughness: 0.52, metalness: 0.22 }),
    paper: new T.MeshStandardMaterial({ color: '#c8cbbf', roughness: 0.95 }),
    fabric: new T.MeshStandardMaterial({ color: '#35413f', roughness: 1 }),
    light: new T.MeshBasicMaterial({ color: '#e4e8d9' }),
    accent: new T.MeshBasicMaterial({ color: '#c9e755' }),
    glass: new T.MeshPhysicalMaterial({
      color: '#7daba3',
      transparent: true,
      opacity: 0.1,
      roughness: 0.16,
      metalness: 0.2,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  };
  const hitTargets = [],
    anchors = {};
  function box(parent, name, dims, pos, material) {
    // 设备的极小倒角让边缘接光；墙体和细刻度仍保持简洁几何。
    let geometry;
    const bevel = Math.min(0.025, ...dims.map((d) => d * 0.12));
    if (Math.min(...dims) > 0.06 && !/wall|floor|hit|tick/.test(name)) {
      const [w, h, d] = dims,
        shape = new T.Shape();
      shape.moveTo(-w / 2 + bevel, -h / 2 + bevel);
      shape.lineTo(w / 2 - bevel, -h / 2 + bevel);
      shape.lineTo(w / 2 - bevel, h / 2 - bevel);
      shape.lineTo(-w / 2 + bevel, h / 2 - bevel);
      shape.closePath();
      geometry = new T.ExtrudeGeometry(shape, {
        depth: d - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        steps: 1,
      });
      geometry.translate(0, 0, -d / 2 + bevel);
    } else geometry = new T.BoxGeometry(...dims);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function rod(parent, a, b, radius, material) {
    const av = new T.Vector3(...a),
      bv = new T.Vector3(...b),
      dir = bv.clone().sub(av);
    const m = new T.Mesh(new T.CylinderGeometry(radius, radius, dir.length(), 12), material);
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
    box(root, 'wall-joint', [0.018, 9, 0.018], [x, 3, -3.48], materials.titanium);
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
  let skyTexture;
  const skyMat = new T.MeshBasicMaterial();
  const sky = new T.Mesh(new T.PlaneGeometry(7.65, 4.0), skyMat);
  sky.position.set(0.5, 4.45, -3.23);
  root.add(sky);
  box(root, 'sill', [8.1, 0.13, 0.62], [0.5, 2.35, -3.07], materials.titanium);
  box(root, 'window-mullion', [0.065, 4.0, 0.06], [-1.92, 4.45, -3.13], materials.titanium);
  box(root, 'window-crossbar', [7.7, 0.055, 0.06], [0.5, 3.2, -3.13], materials.graphite);
  label(root, '35.68 N / 139.76 E', 2.5, 2.12, -3.27, 1.6, '#85978f');
  function drawSky(a) {
    skyTexture?.dispose();
    skyTexture = texture(
      (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, a.sky);
        g.addColorStop(0.82, a.horizon);
        g.addColorStop(1, a.bg);
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        let seed = 29;
        const rnd = () => {
          seed = (seed * 16807) % 2147483647;
          return seed / 2147483647;
        };
        const starAlpha = a.phase === 'night' ? 0.55 : a.phase === 'dusk' ? 0.18 : 0.04;
        for (let i = 0; i < 150; i++) {
          c.fillStyle = 'rgba(217,231,231,' + rnd() * starAlpha + ')';
          c.beginPath();
          c.arc(rnd() * w, rnd() * h * 0.8, 0.5 + rnd(), 0, Math.PI * 2);
          c.fill();
        }
        for (let i = 0; i < 7; i++) {
          c.strokeStyle = 'rgba(190,205,210,0.045)';
          c.lineWidth = 1 + rnd() * 5;
          c.beginPath();
          c.moveTo(0, 350 + i * 15);
          c.bezierCurveTo(280, 360 + i * 16, 700, 300 + i * 20, w, 340 + i * 13);
          c.stroke();
        }
        c.fillStyle = '#172023';
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += 40) c.lineTo(x, h * 0.88 + rnd() * 14);
        c.lineTo(w, h);
        c.fill();
        for (let i = 0; i < 12; i++) {
          const x = rnd() * w,
            y = h * 0.96 - rnd() * 12;
          c.fillStyle = '#1b2528';
          c.fillRect(x, y, 20 + rnd() * 65, h - y);
          c.fillStyle = 'rgba(217,225,192,0.18)';
          c.fillRect(x + 4, y + 5, 2, 2);
        }
      },
      1536,
      800,
    );
    skyMat.map = skyTexture;
    skyMat.needsUpdate = true;
  }

  // 平整台面；窄幅象牙白薄边呼应实验室的档案卡片。
  box(root, 'desk', [11.8, 0.18, 4.7], [0, 1.1, 0.35], materials.graphite);
  box(root, 'desk-front-edge', [11.8, 0.065, 0.08], [0, 1.045, 2.73], materials.ivory);
  box(root, 'desk-underframe', [11.0, 0.3, 3.5], [0, 0.88, 0.2], materials.dark);
  for (const x of [-5.1, 5.1])
    box(root, 'desk-support', [0.16, 2, 3.1], [x, 0.05, 0.15], materials.titanium);
  box(root, 'rear-service-rail', [11.7, 0.24, 0.2], [0, 1.6, -2.03], materials.ivory);
  for (const x of [-4.9, -1.5, 2.4, 4.9])
    box(root, 'service-joint', [0.025, 0.24, 0.22], [x, 1.6, -2.02], materials.titanium);
  label(root, 'WS-03 / PERSONAL STATION', -1.45, 1.61, -1.9, 2.5, '#35423e');

  // 和复习区共用“薄边深色屏”的形态；贴图仅在创建时绘制。
  const tablet = new T.Group();
  tablet.position.set(0, 1.66, 0.75);
  tablet.rotation.x = -1.14;
  root.add(tablet);
  const shape = new T.Shape(),
    w = 3.18,
    h = 1.94,
    r = 0.12;
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const body = new T.Mesh(
    new T.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.012,
      bevelSegments: 2,
      steps: 1,
    }),
    materials.titanium,
  );
  tablet.add(body);
  const screenTex = texture(
    (c, w, h) => {
      c.fillStyle = '#172023';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4d5b58';
      c.lineWidth = 1;
      c.strokeRect(28, 28, w - 56, h - 56);
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
  const screen = new T.Mesh(
    new T.PlaneGeometry(3.02, 1.79),
    new T.MeshBasicMaterial({ map: screenTex }),
  );
  screen.position.z = 0.076;
  tablet.add(screen);
  hit('tablet', tablet, [3.25, 2.0, 0.18], [0, 0, 0.08]);
  rod(root, [-0.7, 1.2, -0.05], [-0.7, 1.73, 0.05], 0.045, materials.titanium);
  rod(root, [0.7, 1.2, -0.05], [0.7, 1.73, 0.05], 0.045, materials.titanium);

  // 少量材料试样，集中表达有机曲面和工业构件的结合。
  const specimen = new T.Group();
  specimen.position.set(-3.65, 1.21, -0.92);
  root.add(specimen);
  box(specimen, 'specimen-base', [1.7, 0.14, 1.35], [0, 0.07, 0], materials.ivory);
  box(specimen, 'specimen-cap', [1.7, 0.09, 1.35], [0, 1.94, 0], materials.ivory);
  for (const x of [-0.79, 0.79])
    for (const z of [-0.61, 0.61])
      rod(specimen, [x, 0.1, z], [x, 1.93, z], 0.023, materials.titanium);
  box(specimen, 'specimen-glass', [1.61, 1.8, 0.015], [0, 1.0, 0.64], materials.glass);
  const verts = [],
    indices = [],
    segments = 100,
    strips = 16;
  for (let i = 0; i <= segments; i++)
    for (let j = 0; j <= strips; j++) {
      const u = (i / segments) * Math.PI * 2,
        v = (j / strips - 0.5) * 0.48;
      verts.push(
        (0.47 + v * Math.cos(u / 2)) * Math.cos(u),
        (0.47 + v * Math.cos(u / 2)) * Math.sin(u),
        v * Math.sin(u / 2),
      );
      if (i < segments && j < strips) {
        const a = i * (strips + 1) + j,
          b = a + strips + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  const geom = new T.BufferGeometry();
  geom.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const bandMat = materials.ivory.clone();
  bandMat.side = T.DoubleSide;
  const band = new T.Mesh(geom, bandMat);
  band.position.set(0, 1.03, 0);
  band.rotation.y = -0.45;
  band.rotation.z = 0.28;
  band.castShadow = true;
  specimen.add(band);
  rod(specimen, [0, 0.15, 0], [0, 0.48, 0], 0.035, materials.titanium);
  rod(specimen, [0.42, 0.8, -0.16], [0.64, 0.8, -0.16], 0.03, materials.titanium);
  label(specimen, 'M-01 / MANIFOLD', -0.66, 0.055, 0.69, 1.25, '#394840');
  hit('specimen', specimen, [1.8, 2.1, 1.5], [0, 1, 0]);

  // 中性台灯，与主站的冷色主光保持相容。
  const lamp = new T.Group();
  lamp.position.set(-2.65, 1.22, 0.12);
  root.add(lamp);
  box(lamp, 'lamp-base', [0.75, 0.08, 0.55], [0, 0.04, 0], materials.titanium);
  rod(lamp, [0, 0.1, 0], [0.07, 1.24, -0.23], 0.035, materials.titanium);
  rod(lamp, [0.07, 1.24, -0.23], [0.75, 1.85, -0.5], 0.035, materials.titanium);
  const head = box(lamp, 'lamp-bar', [1.6, 0.075, 0.17], [0.6, 1.85, -0.5], materials.ivory);
  const glow = box(lamp, 'lamp-diffuser', [1.4, 0.02, 0.12], [0.6, 1.805, -0.5], materials.light);
  const taskLight = new T.PointLight('#e8ecdb', 5.5, 6, 2);
  taskLight.position.set(-2.05, 2.93, -0.38);
  root.add(taskLight);
  hit('lamp', lamp, [1.65, 1.95, 0.65], [0.35, 0.92, -0.3]);
  const cup = new T.Group();
  cup.position.set(-1.92, 1.2, 1.4);
  root.add(cup);
  const cupShape = new T.Mesh(
    new T.CylinderGeometry(0.21, 0.19, 0.46, 32, 1, true),
    materials.ivory,
  );
  cupShape.position.y = 0.24;
  cupShape.castShadow = true;
  cup.add(cupShape);
  const tea = new T.Mesh(new T.CircleGeometry(0.182, 32), materials.dark);
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.385;
  cup.add(tea);
  const rim = new T.Mesh(new T.TorusGeometry(0.202, 0.014, 8, 40), materials.ivory);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.47;
  cup.add(rim);
  const handle = new T.Mesh(new T.TorusGeometry(0.13, 0.025, 8, 24), materials.ivory);
  handle.position.set(-0.25, 0.26, 0);
  cup.add(handle);

  const paperTex = texture(
    (c, w, h) => {
      c.fillStyle = '#cbd0c5';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#394b46';
      c.font = '22px monospace';
      c.fillText('ZHIXU / RESEARCH NOTES', 45, 65);
      c.font = '32px sans-serif';
      c.fillText('连接材料，连接记忆', 45, 123);
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
    },
    512,
    660,
  );
  const report = new T.Group();
  report.position.set(2.82, 1.22, 1.04);
  report.rotation.y = -0.14;
  root.add(report);
  for (let i = 0; i < 4; i++)
    box(report, 'report-sheet', [1.7, 0.012, 2.05], [i * 0.018, i * 0.014, 0], materials.paper);
  const p = new T.Mesh(
    new T.PlaneGeometry(1.7, 2.05),
    new T.MeshStandardMaterial({ map: paperTex, roughness: 1 }),
  );
  p.rotation.x = -Math.PI / 2;
  p.position.y = 0.066;
  report.add(p);
  rod(report, [0.6, 0.12, -0.65], [0.67, 0.12, 0.4], 0.023, materials.titanium);
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
  box(home, 'nook-top', [1.65, 0.08, 1.3], [0, 0.96, 0], materials.graphite);
  for (const x of [-0.79, 0.79])
    box(home, 'nook-side', [0.07, 0.98, 1.3], [x, 0.49, 0], materials.graphite);
  box(home, 'nook-trim', [1.65, 0.025, 0.025], [0, 0.98, 0.64], materials.ivory);
  box(home, 'nook-cushion', [1.45, 0.16, 1.1], [0, 0.12, 0], materials.fabric);
  label(home, 'XIKE / REST', -0.57, 0.84, 0.66, 1.1, '#65796a');
  const shelf = box(root, 'book-shelf', [1.7, 0.075, 1.0], [4.6, 3.95, -3.0], materials.titanium);
  for (let i = 0; i < 7; i++) {
    const book = box(
      root,
      'research-folio',
      [0.12 + (i % 2) * 0.04, 0.65 + (i % 3) * 0.1, 0.45],
      [4.02 + i * 0.17, 4.31, -3.0],
      i % 3 === 0 ? materials.green : materials.ivory,
    );
  }
  label(root, 'FIELD NOTES / 01—07', 3.87, 3.8, -2.7, 1.55, '#8c9e91');
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
      taskLight.intensity = on ? 5.5 : 0;
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
