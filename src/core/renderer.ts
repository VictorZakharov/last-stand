// Renderer, post-processing chain and the camera rig: top-down, over the shoulder or first person.
// The scene renders into its own MSAA target; the post passes (sanitize, bloom, grade)
// run on plain single-sample targets, since multisampled post targets cost a resolve per
// pass (very slow on tile-based GPUs such as Apple's).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { G } from '../state';
import { CAMERA } from '../data/balance';
import { clamp, damp } from '../util';
import { updateSeeThrough } from './seeThrough';
import type { QualityPreset } from '../data/quality';

/** Final colour: above HI_KNEE the brightest channel eases towards HI_CAP (hue kept). */
const HI_KNEE = 1, HI_CAP = 2;
/**
 * Tone mapping keeps the colour of a bright pixel (brightest channel over HUE_FROM, fully over HUE_TO)
 * in a large glare (GLARE_FROM..GLARE_TO): a big bright area stays its colour, a small hot core may go white.
 */
const HUE_FROM = 1, HUE_TO = 1.6, GLARE_FROM = 0.05, GLARE_TO = 0.4;
/**
 * The eye adapts to how bright an area is, at two scales: where the average light over a small area (a 16x9
 * grid of the frame) or a large one (4x3) is over its target, the light above ADAPT_BASE is compressed on a
 * power curve that brings that average down to the target. The dim part of every pixel is kept, so the ground
 * round a bright effect never darkens into a shadow, and a curve (not a scale) keeps a glow's falloff instead
 * of flattening it into a disc. Measured after bloom, which then still sees the full light (the eye sees the
 * halos too). The targets [small, large] sit just above each view's ordinary scenes (the close views see the
 * ground the staff light lights up close; the top view's is for its full distance and eases towards `lobby`
 * as it zooms in), which they leave untouched.
 */
const ADAPT = { top: [0.35, 0.11], lobby: [0.45, 0.13], third: [1.2, 0.26], first: [0.5, 0.13] } as const;
const ADAPT_BASE = 0.04;
/** Bloom's blur levels, tightest to widest: the halo round an effect, and only a trace of the screen-wide veil. */
const BLOOM_LEVELS = [0.56, 0.58, 0.6, 0.3, 0.08];
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 1.05 },
    tGlare: { value: null as THREE.Texture | null },
    tSmall: { value: null as THREE.Texture | null }, tLarge: { value: null as THREE.Texture | null },
    uSmall: { value: ADAPT.top[0] }, uLarge: { value: ADAPT.top[1] },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uHurt; uniform float uVignette; uniform sampler2D tGlare;
    uniform sampler2D tSmall; uniform sampler2D tLarge; uniform float uSmall; uniform float uLarge;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    // the power of the light over the base that brings an area's average down to its target
    float adapt(float avg, float target){ return avg > target ? log(target / ${ADAPT_BASE.toFixed(3)}) / log(avg / ${ADAPT_BASE.toFixed(3)}) : 1.0; }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // the eye adapts to a bright area, so a big effect doesn't wash out the view
      const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
      float g = min(adapt(dot(texture2D(tSmall, vUv).rgb, LUM), uSmall), adapt(dot(texture2D(tLarge, vUv).rgb, LUM), uLarge));
      float lum = dot(c.rgb, LUM);
      if (lum > ${ADAPT_BASE.toFixed(3)}) c.rgb *= ${ADAPT_BASE.toFixed(3)} * pow(lum / ${ADAPT_BASE.toFixed(3)}, g) / lum;
      // glare (bloom's blurriest level): how large a bright spot is
      vec3 gl = texture2D(tGlare, vUv).rgb;
      float glare = max(gl.r, max(gl.g, gl.b));
      // the scene and its bloom, compressed like the eye: the brightest channel eases towards a
      // ceiling and the others keep their ratio to it, so a stack of lights stops adding up
      float m = max(c.r, max(c.g, c.b));
      if (m > ${HI_KNEE.toFixed(2)}) c.rgb *= (${HI_KNEE.toFixed(2)} + ${(HI_CAP - HI_KNEE).toFixed(2)} * (1.0 - exp(-(m - ${HI_KNEE.toFixed(2)}) / ${(HI_CAP - HI_KNEE).toFixed(2)}))) / m;
      // tone mapping + sRGB here instead of a separate OutputPass (renderer settings, drawn to the screen).
      // Per channel it squeezes the brightest channel most, so any bright colour ends up white. The eye
      // adapts to a large bright area and sees its colour, so there pixels are mapped by their brightest
      // channel instead, keeping their colour; a small hot core may still go white, and ordinary pixels are as before
      m = max(max(c.r, max(c.g, c.b)), 1e-4);
      vec3 hue = c.rgb / m * toneMapping(vec3(m)).g;
      float keep = smoothstep(${HUE_FROM.toFixed(2)}, ${HUE_TO.toFixed(2)}, m) * smoothstep(${GLARE_FROM.toFixed(2)}, ${GLARE_TO.toFixed(2)}, glare);
      c.rgb = mix(toneMapping(c.rgb), hue, keep);
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

/** The frame's average light (box downsamples to one pixel), for the grade's adaptation. */
class AreaPass extends Pass {
  private steps = [[64, 36], [16, 9], [4, 3]].map(([w, h]) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }));
  readonly small = this.steps[1];
  readonly large = this.steps[2];
  private mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    // 8x8 bilinear taps spread over the output texel: a box average of its footprint
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
      void main(){
        vec3 s = vec3(0.0);
        for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++)
          { vec3 v = texture2D(tDiffuse, vUv + (vec2(float(x), float(y)) - 3.5) * uStep).rgb; s += any(isnan(v)) || any(isinf(v)) ? vec3(0.0) : min(v, vec3(64.0)); }
        gl_FragColor = vec4(s / 64.0, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  private quad = new FullScreenQuad(this.mat);
  constructor() { super(); this.needsSwap = false; }
  override render(r: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    let src = read;
    for (const dst of this.steps) {
      this.mat.uniforms.tDiffuse.value = src.texture; src = dst;
      // taps an eighth of an output texel apart
      this.mat.uniforms.uStep.value.set(1 / dst.width / 8, 1 / dst.height / 8);
      r.setRenderTarget(dst);
      this.quad.render(r);
    }
  }
}

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
  /** the top-down view's yaw (its middle-drag orbit), kept while a close view turns the camera */
  topYaw: 0,
  view: 'top' as ViewMode,
  fromView: 'top' as ViewMode,
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0, 0.9);
  // each blur level's weight, tightest to widest (radius 0: used as they are). The widest levels spread a
  // bright effect over half the screen as a pale veil that fogs up the scene, so they only add a trace
  bloom.compositeMaterial.uniforms.bloomFactors.value = BLOOM_LEVELS;
  composer.addPass(bloom);
  // after bloom: the eye adapts to all the light that reaches it, halos included
  const area = new AreaPass();
  composer.addPass(area);
  grade = new ShaderPass(GradeShader);
  grade.uniforms.tGlare.value = bloom.renderTargetsVertical[bloom.nMips - 1].texture;
  grade.uniforms.tSmall.value = area.small.texture;
  grade.uniforms.tLarge.value = area.large.texture;
  composer.addPass(grade);
  // the perf overlay times each pass on the GPU
  for (const [label, pass] of [['sanitize', sanitize], ['area', area], ['bloom', bloom], ['grade', grade]] as [string, Pass][]) {
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
  // leaving top-down keeps its yaw; coming back swings to it the short way round, not the way mouse look left it
  if (rig.view === 'top') rig.topYaw = rig.targetYaw;
  else if (v === 'top') {
    const turn = Math.PI * 2;
    rig.targetYaw = rig.topYaw + Math.round((rig.yaw - rig.topYaw) / turn) * turn;
  }
  rig.fromView = rig.view; rig.view = v;
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
      // the shoulder the camera looks over, then back along the view. It never closes in on the
      // character: props and walls in the way dissolve instead (core/seeThrough.ts)
      _pivot.set(focus.x + cy * CAMERA.third.side, height * 0.82, focus.z - sy * CAMERA.third.side);
      cam.position.copy(_pivot).addScaledVector(_fwd, -rig.boom);
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
  // props dissolve over the shoulder view, fading in and out with the glide to and from it
  const e = ease(rig.blend);
  updateSeeThrough(focus.x, height * 0.6, focus.z, (rig.view === 'third' ? e : 0) + (rig.fromView === 'third' ? 1 - e : 0));
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
/** Where the perf overlay's GPU timing moves on to the next part of the frame (a no-op unless it's on). */
export const gpuMarks = { mark: (_label: string): void => {} };

export function render(): void {
  // a change the resize event missed: fit, and tell the rest of the page (UI scale...) too
  if (fitViewport()) window.dispatchEvent(new Event('resize'));
  grade.uniforms.uTime.value = G.time;
  grade.uniforms.uHurt.value = rig.hurt;
  // the adaptation targets glide with the view
  const target = (v: ViewMode, i: 0 | 1): number => v !== 'top' ? ADAPT[v][i]
    : ADAPT.lobby[i] + (ADAPT.top[i] - ADAPT.lobby[i]) * clamp((rig.zoom - CAMERA.lobbyZoom) / (1 - CAMERA.lobbyZoom), 0, 1);
  const e = ease(rig.blend), u = grade.uniforms;
  u.uSmall.value = target(rig.fromView, 0) + (target(rig.view, 0) - target(rig.fromView, 0)) * e;
  u.uLarge.value = target(rig.fromView, 1) + (target(rig.view, 1) - target(rig.fromView, 1)) * e;
  gl.setRenderTarget(sceneRT);
  gpuMarks.mark('scene');
  gl.render(G.scene, G.camera);
  composer.render();
}
