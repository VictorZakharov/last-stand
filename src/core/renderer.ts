// Renderer, post-processing chain and the camera rig: top-down, over the shoulder or first person.
// The scene renders into its own MSAA target; the post passes (sanitize, bloom, grade)
// run on plain single-sample targets, since multisampled post targets cost a resolve per
// pass (very slow on tile-based GPUs such as Apple's).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G } from '../state';
import { CAMERA } from '../data/balance';
import { clamp, damp } from '../util';
import type { QualityPreset } from '../data/quality';

/** Final colour: above HI_KNEE the brightest channel eases towards HI_CAP (hue kept). */
const HI_KNEE = 1, HI_CAP = 2;
/** How strongly glare around a pixel darkens it (the eye adapting to a flash). */
const GLARE_ADAPT = 1.5;
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 1.05 },
    tGlare: { value: null as THREE.Texture | null },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uHurt; uniform float uVignette; uniform sampler2D tGlare;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // the eye adapts: where a big flash glares (bloom's blurriest level), everything around it
      // is seen darker, so a bright effect doesn't wash out the view
      vec3 gl = texture2D(tGlare, vUv).rgb;
      c.rgb /= 1.0 + ${GLARE_ADAPT.toFixed(2)} * max(gl.r, max(gl.g, gl.b));
      // the scene and its bloom, compressed like the eye: the brightest channel eases towards a
      // ceiling and the others keep their ratio to it, so a stack of lights stays its own colour
      // (tone mapping would turn anything far over 1 white)
      float m = max(c.r, max(c.g, c.b));
      if (m > ${HI_KNEE.toFixed(2)}) c.rgb *= (${HI_KNEE.toFixed(2)} + ${(HI_CAP - HI_KNEE).toFixed(2)} * (1.0 - exp(-(m - ${HI_KNEE.toFixed(2)}) / ${(HI_CAP - HI_KNEE).toFixed(2)}))) / m;
      // tone mapping + sRGB here instead of a separate OutputPass (renderer settings, drawn to the screen)
      c.rgb = toneMapping(c.rgb);
      c = linearToOutputTexel(c);
      vec2 d = vUv - 0.5;
      float r = dot(d, d);
      float vig = 1.0 - smoothstep(0.12, 0.75, r * uVignette);
      c.rgb *= mix(0.35, 1.0, vig);
      // cool shadows, warm highlights
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(c.rgb * vec3(0.93,0.97,1.08), c.rgb * vec3(1.04,1.0,0.94), smoothstep(0.2,0.8,l));
      c.rgb += (h(vUv * 900.0 + uTime) - 0.5) * 0.025;
      c.rgb = mix(c.rgb, vec3(0.6,0.02,0.02), uHurt * smoothstep(0.05, 0.5, r) * 0.8);
      gl_FragColor = c;
    }`,
};

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c)) || any(isinf(c)) || c.r != c.r || c.g != c.g || c.b != c.b;
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(c, 0.0, 64.0);
    }`,
};

let composer: EffectComposer, grade: ShaderPass, gl: THREE.WebGLRenderer, sceneRT: THREE.WebGLRenderTarget;
const rig = {
  zoom: 1,
  targetZoom: 1,
  shake: 0,
  focus: new THREE.Vector3(),
  hurt: 0,
  yaw: 0,          // rotation around the focus; 0 looks toward -Z
  targetYaw: 0,
  view: 'top' as ViewMode,
  look: 0,         // close views: pitch below the horizon
  boom: CAMERA.third.boom,
  targetBoom: CAMERA.third.boom,
  /** a view switch glides from the pose the camera had (blend 0) to the new view's (1) */
  blend: 1,
  fromPos: new THREE.Vector3(),
  fromQuat: new THREE.Quaternion(),
  fromFov: CAMERA.fov,
};

/** top-down (the default), over the shoulder, or through the character's eyes */
export type ViewMode = 'top' | 'third' | 'first';
export const VIEWS: ViewMode[] = ['top', 'third', 'first'];

export function initRenderer(container: HTMLElement) {
  const renderer = gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030307);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.5, 300);

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false }));
  // Kill NaN/Inf pixels before bloom: a single bad pixel would otherwise be blurred
  // into large black rectangles. It reads the scene target itself ('none': not the read buffer).
  const sanitize = new ShaderPass(SanitizeShader, 'none');
  sanitize.uniforms.tDiffuse.value = sceneRT.texture;
  composer.addPass(sanitize);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0.55, 0.9);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader);
  grade.uniforms.tGlare.value = bloom.renderTargetsVertical[bloom.nMips - 1].texture;
  composer.addPass(grade);
  // the perf overlay times each pass on the GPU
  for (const [label, pass] of [['sanitize', sanitize], ['bloom', bloom], ['grade', grade]] as const) {
    const run = pass.render.bind(pass);
    pass.render = (...a: Parameters<typeof run>) => { gpuMarks.mark(label); run(...a); };
  }

  G.scene = scene; G.camera = camera; G.renderer = renderer;
  window.addEventListener('resize', fitViewport);
  fitViewport();
  return { scene, camera, renderer };
}

/** the window size and device pixel ratio the canvas was last fitted to, and the quality's pixel ratio cap */
const fitted = { w: 0, h: 0, dpr: 0 };
let pixelRatioCap = 1.5;
/**
 * Fit the canvas, render targets and camera to the window. Runs on resize and every frame, as
 * moving the window to another monitor can change the pixel ratio without a resize event, and can
 * report a zero size on the way: that would leave zero-sized render targets (a black screen) until
 * the next resize, so the last real size stays. Returns whether anything changed.
 */
function fitViewport(): boolean {
  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  if (w < 1 || h < 1 || (w === fitted.w && h === fitted.h && dpr === fitted.dpr)) return false;
  fitted.w = w; fitted.h = h; fitted.dpr = dpr;
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  const pr = Math.min(dpr, pixelRatioCap);
  if (pr !== gl.getPixelRatio()) { gl.setPixelRatio(pr); composer.setPixelRatio(pr); }
  gl.setSize(w, h);
  composer.setSize(w, h);
  fitSceneTarget();
  return true;
}

/** The offscreen target the scene is rendered into (shaders must be compiled for it). */
export const sceneTarget = (): THREE.WebGLRenderTarget => sceneRT;

const _size = new THREE.Vector2();
function fitSceneTarget(): void {
  gl.getDrawingBufferSize(_size);
  sceneRT.setSize(_size.x, _size.y);
}

/** Apply the render-cost settings of a quality preset, live. None of them change shader variants. */
export function setRenderQuality(p: QualityPreset): void {
  pixelRatioCap = p.pixelRatio;
  const pr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
  if (pr !== gl.getPixelRatio()) { gl.setPixelRatio(pr); composer.setPixelRatio(pr); fitSceneTarget(); }
  // a render target re-initialises with the new sample count on its next use
  if (sceneRT.samples !== p.msaa) { sceneRT.samples = p.msaa; sceneRT.dispose(); }
}

export function addShake(amount: number): void { rig.shake = Math.min(1.2, rig.shake + amount); }
export function flashHurt(amount: number): void { rig.hurt = Math.min(1, rig.hurt + amount); }
export function setZoom(z: number): void { rig.targetZoom = clamp(z, CAMERA.minZoom, CAMERA.maxZoom); }
/** 
otches = mouse-wheel steps (positive = zoom out). */
export function zoomBy(notches: number): void {
  // over the shoulder the wheel pulls the camera in or out; through the eyes it does nothing
  if (rig.view === 'third') { rig.targetBoom = clamp(rig.targetBoom * CAMERA.zoomStep ** notches, CAMERA.third.minBoom, CAMERA.third.maxBoom); return; }
  if (rig.view !== 'top') return;
  rig.targetZoom = clamp(rig.targetZoom * CAMERA.zoomStep ** notches, CAMERA.minZoom, CAMERA.maxZoom); }

/** Middle-drag orbit: dragging right turns the world right (the camera swings left). */
export function orbitBy(px: number): void { if (rig.view === 'top') rig.targetYaw -= px * CAMERA.orbitSpeed; }
/** Mouse look in the close views: right turns right, down looks down. */
export function lookBy(dx: number, dy: number): void {
  if (rig.view === 'top') return;
  rig.yaw = rig.targetYaw = rig.yaw - dx * CAMERA.lookSpeed;
  const v = CAMERA[rig.view];
  rig.look = clamp(rig.look + dy * CAMERA.lookSpeed, v.minPitch, v.maxPitch);
}
export const viewMode = (): ViewMode => rig.view;
/** First person: the way the character faces is where the camera looks. */
export const lookFacing = (): number | null => (rig.view === 'first' ? rig.yaw + Math.PI : null);
/** Switch view, gliding there from wherever the camera is now. */
export function setView(v: ViewMode): void {
  if (v === rig.view) return;
  const cam = G.camera;
  rig.fromPos.copy(cam.position); rig.fromQuat.copy(cam.quaternion); rig.fromFov = cam.fov;
  rig.blend = 0;
  if (v !== 'top') rig.look = CAMERA[v].pitch;
  rig.view = v;
}
/** The first-person view is still gliding in (the body stays visible until the camera reaches the eyes). */
export const viewSettled = (): boolean => rig.blend >= 1;
/** Camera yaw in radians: screen-up is world (-sin, -cos) on XZ. */
export const cameraYaw = (): number => rig.yaw;

/** Screen px to move the view by, so the character stays in sight beside (x) or below (y) a lobby panel. */
const shift = { x: 0, y: 0, tx: 0, ty: 0 };
export function setViewShift(x: number, y: number): void { shift.tx = x; shift.ty = y; }

/** `height`: the character's, for the close views' shoulder and eye level. */
export function updateCamera(dt: number, focus: THREE.Vector3, height: number): void {
  const cam = G.camera;
  shift.x = damp(shift.x, shift.tx, 6, dt);
  shift.y = damp(shift.y, shift.ty, 6, dt);
  if (Math.abs(shift.x) + Math.abs(shift.y) > 0.5) {
    const w = fitted.w, h = fitted.h;
    cam.setViewOffset(w, h, -shift.x, -shift.y, w, h);
  } else if (cam.view) cam.clearViewOffset();
  rig.zoom = damp(rig.zoom, rig.targetZoom, 8, dt);
  rig.focus.x = damp(rig.focus.x, focus.x, CAMERA.follow, dt);
  rig.focus.z = damp(rig.focus.z, focus.z, CAMERA.follow, dt);
  rig.focus.y = 0;
  rig.yaw = damp(rig.yaw, rig.targetYaw, 18, dt);
  let fov: number = CAMERA.fov, near = 0.5;
  if (rig.view === 'top') {
    const d = CAMERA.distance * rig.zoom;
    // tilt towards the horizon as we zoom in
    const k = clamp((rig.zoom - CAMERA.minZoom) / (1 - CAMERA.minZoom), 0, 1);
    const pitch = CAMERA.closePitch + (CAMERA.pitch - CAMERA.closePitch) * k;
    const lookY = 0.6 + (1 - k) * 0.7;
    const r = Math.cos(pitch) * d;
    cam.position.set(rig.focus.x + Math.sin(rig.yaw) * r, Math.sin(pitch) * d, rig.focus.z + Math.cos(rig.yaw) * r);
    _look.set(rig.focus.x, lookY, rig.focus.z);
    cam.lookAt(_look);
  } else {
    // close views sit right on the character: no follow lag, or the aim would swim
    const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw), cp = Math.cos(rig.look), sp = Math.sin(rig.look);
    _fwd.set(-sy * cp, -sp, -cy * cp);
    if (rig.view === 'third') {
      fov = CAMERA.third.fov;
      rig.boom = damp(rig.boom, rig.targetBoom, 6, dt);
      // the shoulder the camera looks over, then back along the view until a wall or a prop
      _pivot.set(focus.x + cy * CAMERA.third.side, height * 0.82, focus.z - sy * CAMERA.third.side);
      const boom = Math.min(rig.boom, clearBehind(_pivot, _fwd, rig.boom));
      cam.position.copy(_pivot).addScaledVector(_fwd, -boom);
      cam.position.y = Math.max(0.4, cam.position.y);
    } else {
      fov = CAMERA.first.fov; near = 0.08;
      cam.position.set(focus.x - sy * 0.12, height * 0.9, focus.z - cy * 0.12);
    }
    cam.lookAt(_look.copy(cam.position).add(_fwd));
  }
  if (rig.blend < 1) {
    rig.blend = Math.min(1, rig.blend + dt / CAMERA.switchTime);
    const e = ease(rig.blend);
    cam.position.lerpVectors(rig.fromPos, cam.position, e);
    // aim at the character all the way (turning to it early), and settle into the new view's own
    // framing (over the shoulder, through the eyes) only over the last stretch
    _quat.copy(cam.quaternion);
    cam.lookAt(focus.x, height * 0.55, focus.z);
    _quat2.copy(cam.quaternion);   // (slerpQuaternions copies its first argument in before reading the second)
    cam.quaternion.slerpQuaternions(rig.fromQuat, _quat2, ease(Math.min(1, rig.blend / 0.4)));
    cam.quaternion.slerp(_quat, ease(clamp((rig.blend - 0.6) / 0.4, 0, 1)));
    fov = rig.fromFov + (fov - rig.fromFov) * e;
    near = 0.5 + (near - 0.5) * e;
  }
  if (cam.fov !== fov || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
  if (rig.shake > 0.001) {
    const s = rig.shake * rig.shake * (rig.view === 'top' ? 0.6 : 0.12);
    const t = G.time * 60;
    cam.position.x += Math.sin(t * 1.3) * s;
    cam.position.y += Math.sin(t * 1.7 + 1) * s * 0.6;
    cam.position.z += Math.sin(t * 1.1 + 2) * s;
  }
  rig.shake = Math.max(0, rig.shake - dt * 2.2);
  rig.hurt = Math.max(0, rig.hurt - dt * 1.6);
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const _fwd = new THREE.Vector3(), _pivot = new THREE.Vector3(), _look = new THREE.Vector3(), _quat = new THREE.Quaternion(), _quat2 = new THREE.Quaternion();
/** How far back from `p` (against `f`) the camera can sit before a prop or the arena wall. */
function clearBehind(p: THREE.Vector3, f: THREE.Vector3, max: number): number {
  const bx = -f.x, bz = -f.z, h = Math.hypot(bx, bz);
  if (h < 1e-4) return max;
  // along the ground the boom covers h per metre of its length
  let best = max;
  const wall = G.arena.radius + 1.2;
  // the wall: solve |p + b*s| = wall on the ground plane
  const pb = p.x * bx + p.z * bz, pp = p.x * p.x + p.z * p.z;
  const sw = (-pb + Math.sqrt(Math.max(0, pb * pb - h * h * (pp - wall * wall)))) / (h * h);
  best = Math.min(best, Math.max(0.6, sw));
  for (const o of G.arena.obstacles) {
    const ox = o.x - p.x, oz = o.z - p.z, R = o.r + 0.35;
    const t = (ox * bx + oz * bz) / (h * h), cx = ox - bx * t, cz = oz - bz * t;
    const miss = R * R - (cx * cx + cz * cz);
    if (t <= 0 || miss <= 0) continue;
    const s = t - Math.sqrt(miss) / h;
    if (s < best) best = Math.max(0.6, s);
  }
  return best;
}

/** Where the perf overlay's GPU timing moves on to the next part of the frame (a no-op unless it's on). */
export const gpuMarks = { mark: (_label: string): void => {} };

export function render(): void {
  // a change the resize event missed: fit, and tell the rest of the page (UI scale...) too
  if (fitViewport()) window.dispatchEvent(new Event('resize'));
  grade.uniforms.uTime.value = G.time;
  grade.uniforms.uHurt.value = rig.hurt;
  gl.setRenderTarget(sceneRT);
  gpuMarks.mark('scene');
  gl.render(G.scene, G.camera);

  composer.render();
}
