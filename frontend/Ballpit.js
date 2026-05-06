/**
 * Ballpit – vanilla JS port of the React Bits component
 * Original inspiration: Kevin Levron https://x.com/soju22/status/1858925191671271801
 * Ported from React to plain ES-module for use in the DermoTriage home page.
 */

import {
  Vector3, MeshPhysicalMaterial, InstancedMesh, Clock,
  AmbientLight, SphereGeometry, ShaderChunk, Scene,
  Color, Object3D, SRGBColorSpace, MathUtils, PMREMGenerator,
  Vector2, WebGLRenderer, PerspectiveCamera, PointLight,
  ACESFilmicToneMapping, Plane, Raycaster
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ─── Mini Three wrapper ───────────────────────────────────────────────────── */
class ThreeApp {
  #opts; canvas; camera; cameraFov; cameraMinAspect; cameraMaxAspect;
  scene; renderer; #composer;
  size = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0, pixelRatio: 0 };
  render = this.#defaultRender;
  onBeforeRender = () => {}; onAfterRender = () => {}; onAfterResize = () => {};
  #visible = false; #running = false; isDisposed = false;
  #resizeTimer; #roObserver; #ioObserver;
  #clock = new Clock(); #time = { elapsed: 0, delta: 0 }; #rafId;

  constructor(opts) {
    this.#opts = { ...opts };
    this.camera = new PerspectiveCamera();
    this.cameraFov = this.camera.fov;
    this.scene = new Scene();
    this.canvas = opts.canvas || document.getElementById(opts.id);
    this.canvas.style.display = 'block';
    this.renderer = new WebGLRenderer({
      canvas: this.canvas, powerPreference: 'high-performance', antialias: true, alpha: true,
      ...(opts.rendererOptions ?? {})
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.#setupObservers();
    this.resize();
  }

  #setupObservers() {
    window.addEventListener('resize', () => this.#onResize());
    if (this.#opts.size === 'parent' && this.canvas.parentNode) {
      this.#roObserver = new ResizeObserver(() => this.#onResize());
      this.#roObserver.observe(this.canvas.parentNode);
    }
    this.#ioObserver = new IntersectionObserver(entries => {
      this.#visible = entries[0].isIntersecting;
      this.#visible ? this.#startLoop() : this.#stopLoop();
    });
    this.#ioObserver.observe(this.canvas);
    document.addEventListener('visibilitychange', () => {
      if (!this.#visible) return;
      document.hidden ? this.#stopLoop() : this.#startLoop();
    });
  }

  #onResize() {
    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = setTimeout(() => this.resize(), 100);
  }

  resize() {
    const p = this.#opts;
    let w, h;
    if (p.size instanceof Object && p.size.width) { w = p.size.width; h = p.size.height; }
    else if (p.size === 'parent' && this.canvas.parentNode) {
      w = this.canvas.parentNode.offsetWidth; h = this.canvas.parentNode.offsetHeight;
    } else { w = window.innerWidth; h = window.innerHeight; }
    this.size.width = w; this.size.height = h; this.size.ratio = w / h;
    this.#updateCamera(); this.#updateRenderer();
    this.onAfterResize(this.size);
  }

  #updateCamera() {
    this.camera.aspect = this.size.width / this.size.height;
    if (this.cameraMinAspect && this.camera.aspect < this.cameraMinAspect)
      this.#adjustFov(this.cameraMinAspect);
    else if (this.cameraMaxAspect && this.camera.aspect > this.cameraMaxAspect)
      this.#adjustFov(this.cameraMaxAspect);
    else
      this.camera.fov = this.cameraFov;
    this.camera.updateProjectionMatrix();
    this.#updateWorldSize();
  }

  #adjustFov(aspect) {
    const t = Math.tan(MathUtils.degToRad(this.cameraFov / 2)) / (this.camera.aspect / aspect);
    this.camera.fov = 2 * MathUtils.radToDeg(Math.atan(t));
  }

  #updateWorldSize() {
    const fovRad = (this.camera.fov * Math.PI) / 180;
    this.size.wHeight = 2 * Math.tan(fovRad / 2) * this.camera.position.length();
    this.size.wWidth = this.size.wHeight * this.camera.aspect;
  }

  #updateRenderer() {
    this.renderer.setSize(this.size.width, this.size.height);
    let pr = window.devicePixelRatio;
    if (this.maxPixelRatio) pr = Math.min(pr, this.maxPixelRatio);
    if (this.minPixelRatio) pr = Math.max(pr, this.minPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.size.pixelRatio = pr;
  }

  #startLoop() {
    if (this.#running) return;
    this.#running = true; this.#clock.start();
    const loop = () => {
      this.#rafId = requestAnimationFrame(loop);
      this.#time.delta = this.#clock.getDelta();
      this.#time.elapsed += this.#time.delta;
      this.onBeforeRender(this.#time);
      this.render();
      this.onAfterRender(this.#time);
    };
    loop();
  }

  #stopLoop() {
    if (!this.#running) return;
    cancelAnimationFrame(this.#rafId);
    this.#running = false; this.#clock.stop();
  }

  #defaultRender() { this.renderer.render(this.scene, this.camera); }

  clear() {
    this.scene.traverse(obj => {
      if (obj.isMesh) {
        const mat = obj.material;
        if (mat && typeof mat === 'object')
          Object.values(mat).forEach(v => v?.dispose?.());
        mat?.dispose?.(); obj.geometry?.dispose?.();
      }
    });
    this.scene.clear();
  }

  dispose() {
    window.removeEventListener('resize', this.#onResize);
    this.#roObserver?.disconnect(); this.#ioObserver?.disconnect();
    this.#stopLoop(); this.clear();
    this.renderer.dispose(); this.renderer.forceContextLoss();
    this.isDisposed = true;
  }
}

/* ─── Pointer tracker ─────────────────────────────────────────────────────── */
const _tracked = new Map();
const _cursor = new Vector2();
let _listening = false;

function trackPointer({ domElement, onMove, onLeave }) {
  const state = {
    position: new Vector2(), nPosition: new Vector2(),
    hover: false, touching: false,
    onMove: onMove || (() => {}), onLeave: onLeave || (() => {})
  };
  _tracked.set(domElement, state);

  if (!_listening) {
    document.body.addEventListener('pointermove', _onMove);
    document.body.addEventListener('pointerleave', _onLeave);
    document.body.addEventListener('touchstart', _onTouchStart, { passive: false });
    document.body.addEventListener('touchmove', _onTouchMove, { passive: false });
    document.body.addEventListener('touchend', _onTouchEnd, { passive: false });
    document.body.addEventListener('touchcancel', _onTouchEnd, { passive: false });
    _listening = true;
  }

  return {
    dispose() {
      _tracked.delete(domElement);
      if (_tracked.size === 0) {
        document.body.removeEventListener('pointermove', _onMove);
        document.body.removeEventListener('pointerleave', _onLeave);
        document.body.removeEventListener('touchstart', _onTouchStart);
        document.body.removeEventListener('touchmove', _onTouchMove);
        document.body.removeEventListener('touchend', _onTouchEnd);
        document.body.removeEventListener('touchcancel', _onTouchEnd);
        _listening = false;
      }
    }
  };
}

function _setPos(state, rect) {
  state.position.x = _cursor.x - rect.left;
  state.position.y = _cursor.y - rect.top;
  state.nPosition.x = (state.position.x / rect.width) * 2 - 1;
  state.nPosition.y = -(state.position.y / rect.height) * 2 + 1;
}
function _inRect(rect) {
  return _cursor.x >= rect.left && _cursor.x <= rect.left + rect.width &&
    _cursor.y >= rect.top && _cursor.y <= rect.top + rect.height;
}

function _onMove(e) {
  _cursor.set(e.clientX, e.clientY);
  for (const [el, s] of _tracked) {
    const r = el.getBoundingClientRect();
    _setPos(s, r);
    if (_inRect(r)) {
      if (!s.hover) { s.hover = true; }
      s.onMove(s);
    } else if (s.hover && !s.touching) {
      s.hover = false; s.onLeave(s);
    }
  }
}
function _onLeave() {
  for (const s of _tracked.values()) { if (s.hover) { s.hover = false; s.onLeave(s); } }
}
function _onTouchStart(e) {
  if (!e.touches.length) return;
  e.preventDefault();
  _cursor.set(e.touches[0].clientX, e.touches[0].clientY);
  for (const [el, s] of _tracked) {
    const r = el.getBoundingClientRect();
    if (_inRect(r)) { _setPos(s, r); s.touching = true; s.hover = true; s.onMove(s); }
  }
}
function _onTouchMove(e) {
  if (!e.touches.length) return;
  e.preventDefault();
  _cursor.set(e.touches[0].clientX, e.touches[0].clientY);
  for (const [el, s] of _tracked) {
    const r = el.getBoundingClientRect();
    _setPos(s, r);
    if (_inRect(r)) { if (!s.hover) { s.hover = true; s.touching = true; } s.onMove(s); }
    else if (s.hover && s.touching) s.onMove(s);
  }
}
function _onTouchEnd() {
  for (const s of _tracked.values()) {
    if (s.touching) { s.touching = false; if (s.hover) { s.hover = false; s.onLeave(s); } }
  }
}

/* ─── Physics ─────────────────────────────────────────────────────────────── */
const { randFloat, randFloatSpread } = MathUtils;
const _tmp = Array.from({ length: 10 }, () => new Vector3());

class BallPhysics {
  constructor(cfg) {
    this.config = cfg;
    this.positionData = new Float32Array(3 * cfg.count).fill(0);
    this.velocityData = new Float32Array(3 * cfg.count).fill(0);
    this.sizeData = new Float32Array(cfg.count).fill(1);
    this.center = new Vector3();
    this.#init();
    this.setSizes();
  }
  #init() {
    const { config: c, positionData: pd } = this;
    this.center.toArray(pd, 0);
    for (let i = 1; i < c.count; i++) {
      pd[i * 3]     = randFloatSpread(2 * c.maxX);
      pd[i * 3 + 1] = randFloatSpread(2 * c.maxY);
      pd[i * 3 + 2] = randFloatSpread(2 * c.maxZ);
    }
  }
  setSizes() {
    const { config: c, sizeData: sd } = this;
    sd[0] = c.size0;
    for (let i = 1; i < c.count; i++) sd[i] = randFloat(c.minSize, c.maxSize);
  }
  update(e) {
    const { config: c, center, positionData: pd, velocityData: vd, sizeData: sd } = this;
    const [pos0, vel0, posI, velI, posJ, velJ, diff, push, pushI, pushJ] = _tmp;
    let start = 0;
    if (c.controlSphere0) {
      start = 1;
      pos0.fromArray(pd, 0).lerp(center, 0.1).toArray(pd, 0);
      vel0.set(0, 0, 0).toArray(vd, 0);
    }
    for (let i = start; i < c.count; i++) {
      const b = i * 3;
      posI.fromArray(pd, b); velI.fromArray(vd, b);
      velI.y -= e.delta * c.gravity * sd[i];
      velI.multiplyScalar(c.friction).clampLength(0, c.maxVelocity);
      posI.add(velI).toArray(pd, b); velI.toArray(vd, b);
    }
    for (let i = start; i < c.count; i++) {
      const bi = i * 3;
      posI.fromArray(pd, bi); velI.fromArray(vd, bi);
      const ri = sd[i];
      for (let j = i + 1; j < c.count; j++) {
        const bj = j * 3;
        posJ.fromArray(pd, bj); velJ.fromArray(vd, bj);
        const rj = sd[j];
        diff.copy(posJ).sub(posI);
        const dist = diff.length(), sumR = ri + rj;
        if (dist < sumR) {
          push.copy(diff).normalize().multiplyScalar(0.5 * (sumR - dist));
          pushI.copy(push).multiplyScalar(Math.max(velI.length(), 1));
          pushJ.copy(push).multiplyScalar(Math.max(velJ.length(), 1));
          posI.sub(push); velI.sub(pushI); posI.toArray(pd, bi); velI.toArray(vd, bi);
          posJ.add(push); velJ.add(pushJ); posJ.toArray(pd, bj); velJ.toArray(vd, bj);
        }
      }
      if (c.controlSphere0) {
        pos0.fromArray(pd, 0);
        diff.copy(pos0).sub(posI);
        const dist = diff.length(), sumR0 = ri + sd[0];
        if (dist < sumR0) {
          const d = sumR0 - dist;
          push.copy(diff.normalize()).multiplyScalar(d);
          pushI.copy(push).multiplyScalar(Math.max(velI.length(), 2));
          posI.sub(push); velI.sub(pushI);
        }
      }
      if (Math.abs(posI.x) + ri > c.maxX) { posI.x = Math.sign(posI.x) * (c.maxX - ri); velI.x = -velI.x * c.wallBounce; }
      if (c.gravity === 0) {
        if (Math.abs(posI.y) + ri > c.maxY) { posI.y = Math.sign(posI.y) * (c.maxY - ri); velI.y = -velI.y * c.wallBounce; }
      } else if (posI.y - ri < -c.maxY) { posI.y = -c.maxY + ri; velI.y = -velI.y * c.wallBounce; }
      const mz = Math.max(c.maxZ, c.maxSize);
      if (Math.abs(posI.z) + ri > mz) { posI.z = Math.sign(posI.z) * (c.maxZ - ri); velI.z = -velI.z * c.wallBounce; }
      posI.toArray(pd, bi); velI.toArray(vd, bi);
    }
  }
}

/* ─── Subsurface scattering material ──────────────────────────────────────── */
class SSMaterial extends MeshPhysicalMaterial {
  constructor(params) {
    super(params);
    this.uniforms = {
      thicknessDistortion: { value: 0.1 }, thicknessAmbient: { value: 0 },
      thicknessAttenuation: { value: 0.1 }, thicknessPower: { value: 2 }, thicknessScale: { value: 10 }
    };
    this.defines.USE_UV = '';
    this.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = `
        uniform float thicknessPower,thicknessScale,thicknessDistortion,thicknessAmbient,thicknessAttenuation;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', `
        void RE_Direct_Scattering(const in IncidentLight dl, const in vec2 uv,
          const in vec3 gPos, const in vec3 gNorm, const in vec3 gView,
          const in vec3 gCC, inout ReflectedLight rl) {
          vec3 sh = normalize(dl.direction + (gNorm * thicknessDistortion));
          float sd = pow(saturate(dot(gView, -sh)), thicknessPower) * thicknessScale;
          #ifdef USE_COLOR
            vec3 si = (sd + thicknessAmbient) * vColor;
          #else
            vec3 si = (sd + thicknessAmbient) * diffuse;
          #endif
          rl.directDiffuse += si * thicknessAttenuation * dl.color;
        }
        void main() {`);
      const patched = ShaderChunk.lights_fragment_begin.replaceAll(
        'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
         RE_Direct_Scattering(directLight, vUv, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, reflectedLight);`
      );
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', patched);
    };
  }
}

/* ─── Instanced ball mesh ─────────────────────────────────────────────────── */
const DEFAULT_CFG = {
  count: 200, colors: [0x14b8a6, 0x8b5cf6, 0x3b82f6],
  ambientColor: 0xffffff, ambientIntensity: 1, lightIntensity: 200,
  materialParams: { metalness: 0.5, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.15 },
  minSize: 0.5, maxSize: 1, size0: 1,
  gravity: 0.5, friction: 0.9975, wallBounce: 0.95,
  maxVelocity: 0.15, maxX: 5, maxY: 5, maxZ: 2,
  controlSphere0: false, followCursor: true
};

const _dummy = new Object3D();

class BallpitMesh extends InstancedMesh {
  constructor(renderer, opts = {}) {
    const cfg = { ...DEFAULT_CFG, ...opts };
    const envTex = new PMREMGenerator(renderer, 0.04).fromScene(new RoomEnvironment()).texture;
    const mat = new SSMaterial({ envMap: envTex, ...cfg.materialParams });
    mat.envMapRotation.x = -Math.PI / 2;
    super(new SphereGeometry(), mat, cfg.count);
    this.config = cfg;
    this.physics = new BallPhysics(cfg);
    this.ambientLight = new AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
    this.add(this.ambientLight);
    this.light = new PointLight(cfg.colors[0], cfg.lightIntensity);
    this.add(this.light);
    this._applyColors(cfg.colors);
  }

  _applyColors(cols) {
    if (!Array.isArray(cols) || cols.length < 2) return;
    const palette = cols.map(c => new Color(c));
    for (let i = 0; i < this.count; i++) {
      const t = i / this.count * (palette.length - 1);
      const lo = Math.floor(t), hi = Math.min(lo + 1, palette.length - 1), a = t - lo;
      const c = new Color().copy(palette[lo]);
      c.r += a * (palette[hi].r - palette[lo].r);
      c.g += a * (palette[hi].g - palette[lo].g);
      c.b += a * (palette[hi].b - palette[lo].b);
      this.setColorAt(i, c);
      if (i === 0) this.light.color.copy(c);
    }
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
  }

  update(e) {
    this.physics.update(e);
    for (let i = 0; i < this.count; i++) {
      _dummy.position.fromArray(this.physics.positionData, i * 3);
      _dummy.scale.setScalar(i === 0 && !this.config.followCursor ? 0 : this.physics.sizeData[i]);
      _dummy.updateMatrix();
      this.setMatrixAt(i, _dummy.matrix);
      if (i === 0) this.light.position.copy(_dummy.position);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

/* ─── Public factory ──────────────────────────────────────────────────────── */
export function createBallpit(canvas, opts = {}) {
  const app = new ThreeApp({ canvas, size: 'parent', rendererOptions: { antialias: true, alpha: true } });
  app.renderer.toneMapping = ACESFilmicToneMapping;
  app.camera.position.set(0, 0, 20);
  app.camera.lookAt(0, 0, 0);
  app.cameraMaxAspect = 1.5;
  app.resize();

  let mesh;
  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  let paused = false;

  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';

  function init(cfg) {
    if (mesh) { app.clear(); app.scene.remove(mesh); }
    mesh = new BallpitMesh(app.renderer, cfg);
    app.scene.add(mesh);
  }

  const pointer = trackPointer({
    domElement: canvas,
    onMove(s) {
      raycaster.setFromCamera(s.nPosition, app.camera);
      app.camera.getWorldDirection(plane.normal);
      raycaster.ray.intersectPlane(plane, hit);
      mesh.physics.center.copy(hit);
      mesh.config.controlSphere0 = true;
    },
    onLeave() { mesh.config.controlSphere0 = false; }
  });

  init({ followCursor: opts.followCursor ?? true, ...opts });

  app.onBeforeRender = e => { if (!paused) mesh.update(e); };
  app.onAfterResize = s => { mesh.config.maxX = s.wWidth / 2; mesh.config.maxY = s.wHeight / 2; };

  return {
    get three() { return app; },
    get spheres() { return mesh; },
    togglePause() { paused = !paused; },
    setCount(n) { init({ ...mesh.config, count: n }); },
    dispose() { pointer.dispose(); app.dispose(); }
  };
}
