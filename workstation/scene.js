import * as T from '../vendor/three/three.module.min.js';
import { buildWorkstation } from './model.js?v=19';
import { createStudioEnvironment } from './surfaces.js?v=19';

export function createScene(canvas, { onSelect, onProject, motion = true }) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(45, 1, 0.1, 90);
  const pmrem = new T.PMREMGenerator(renderer),
    room = createStudioEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.85;
  scene.environmentRotation.y = 0.35;
  pmrem.dispose();
  room.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
  const key = new T.DirectionalLight('#e6edf2', 2.4);
  key.position.set(-3.4, 7.8, 1.6);
  key.target.position.set(0, 1.3, 0);
  key.castShadow = true;
  const shadowSize = innerWidth < 700 ? 1024 : 2048;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -5;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.radius = 3;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.014;
  scene.add(key, key.target);
  const fill = new T.HemisphereLight('#aec4d1', '#15191b', 0.68);
  scene.add(fill);
  const rim = new T.DirectionalLight('#9fb8bd', 1.8);
  rim.position.set(2, 5.5, -3);
  scene.add(rim);
  const model = buildWorkstation(scene);
  // Geometry and lights are stationary; camera moves reuse the shadow map.
  renderer.shadowMap.needsUpdate = true;
  const ray = new T.Raycaster(),
    pointer = new T.Vector2();
  const look = new T.Vector3(),
    targetLook = new T.Vector3(),
    targetPosition = new T.Vector3();
  let enabledMotion = motion,
    raf = 0,
    last = 0,
    focused = null,
    gesture = null,
    hover = null,
    lost = false;
  let dragX = 0,
    dragY = 0;
  function home() {
    const mobile = innerWidth < 700;
    return {
      position: mobile ? [0, 4.5, 12.4] : [0, 4.0, 8.7],
      target: mobile ? [0, 2.6, -0.35] : [0, 2.65, -0.7],
    };
  }
  function setTargets() {
    const pose = focused ? model.focus[focused] : home();
    targetPosition.set(...pose.position);
    targetLook.set(...pose.target);
    if (!focused) {
      targetLook.x += dragX;
      targetLook.y += dragY;
      targetPosition.x += dragX * 0.22;
    }
    if (innerWidth < 700 && focused) {
      targetPosition.z += 1.7;
      targetPosition.y += 0.45;
    }
  }
  function project() {
    const rect = canvas.getBoundingClientRect(),
      result = {};
    for (const [name, anchor] of Object.entries(model.anchors)) {
      const v = anchor.getWorldPosition(new T.Vector3()).project(camera);
      result[name] = {
        x: ((v.x + 1) * rect.width) / 2,
        y: ((1 - v.y) * rect.height) / 2,
        visible: Math.abs(v.x) < 1 && Math.abs(v.y) < 0.84 && v.z < 1,
      };
    }
    onProject(result);
  }
  function render(now = performance.now()) {
    raf = 0;
    if (document.hidden || lost) return;
    const dt = Math.min(0.08, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const factor = enabledMotion ? 1 - Math.exp(-dt * 8) : 1;
    camera.position.lerp(targetPosition, factor);
    look.lerp(targetLook, factor);
    camera.lookAt(look);
    renderer.render(scene, camera);
    project();
    if (
      camera.position.distanceToSquared(targetPosition) + look.distanceToSquared(targetLook) >
      0.000002
    )
      raf = requestAnimationFrame(render);
  }
  function requestRender() {
    if (!raf && !document.hidden && !lost) {
      last = 0;
      raf = requestAnimationFrame(render);
    }
  }
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = innerWidth < 700 ? 49 : 45;
    camera.updateProjectionMatrix();
    setTargets();
    requestRender();
  }
  function actionAt(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    return ray.intersectObjects(model.hitTargets, false)[0]?.object.userData.action || null;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || focused) return;
    gesture = { x: e.clientX, y: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (gesture) {
      const dx = e.clientX - gesture.x,
        dy = e.clientY - gesture.y;
      if (Math.hypot(dx, dy) > 8) gesture.moved = true;
      if (gesture.moved) {
        dragX = Math.max(-2.3, Math.min(2.3, (-dx / canvas.clientWidth) * 5));
        dragY = Math.max(-0.7, Math.min(0.7, (dy / canvas.clientHeight) * 2));
        setTargets();
        requestRender();
      }
    } else {
      const next = actionAt(e);
      if (next !== hover) {
        hover = next;
        canvas.style.cursor = next ? 'pointer' : 'grab';
      }
    }
  });
  function release(e, cancelled = false) {
    if (!gesture) return;
    const moved = gesture.moved;
    gesture = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    dragX = 0;
    dragY = 0;
    setTargets();
    requestRender();
    if (!cancelled && !moved) {
      const action = actionAt(e);
      if (action) onSelect(action);
    }
  }
  canvas.addEventListener('pointerup', (e) => release(e));
  canvas.addEventListener('pointercancel', (e) => release(e, true));
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    document.body.classList.add('no-webgl');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    renderer.shadowMap.needsUpdate = true;
    document.body.classList.remove('no-webgl');
    requestRender();
  });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    } else requestRender();
  });
  setTargets();
  camera.position.copy(targetPosition);
  look.copy(targetLook);
  resize();
  return {
    focus(id) {
      focused = model.focus[id] ? id : null;
      dragX = 0;
      dragY = 0;
      setTargets();
      requestRender();
    },
    reset() {
      focused = null;
      dragX = 0;
      dragY = 0;
      setTargets();
      requestRender();
    },
    motion(value) {
      enabledMotion = value;
      requestRender();
    },
    lamp(value) {
      model.setLamp(value);
      requestRender();
    },
    atmosphere(a) {
      scene.background = new T.Color(a.bg);
      scene.fog = new T.Fog(a.bg, 17, 42);
      key.color.set(a.key);
      fill.color.set(a.fill);
      renderer.toneMappingExposure = 1.18 * a.gain;
      model.drawSky(a);
      requestRender();
    },
    // 仅供检查资源规模，不暴露渲染器或学习数据。
    stats() {
      return {
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        textures: renderer.info.memory.textures,
      };
    },
  };
}
