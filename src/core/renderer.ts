// Renderer, post-processing chain and the top-down camera rig.
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

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 1.05 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uHurt; uniform float uVignette;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
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
};

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
  composer.addPass(grade);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    fitSceneTarget();
  });

  G.scene = scene; G.camera = camera; G.renderer = renderer;
  return { scene, camera, renderer };
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
  const pr = Math.min(window.devicePixelRatio, p.pixelRatio);
  if (pr !== gl.getPixelRatio()) { gl.setPixelRatio(pr); composer.setPixelRatio(pr); fitSceneTarget(); }
  // a render target re-initialises with the new sample count on its next use
  if (sceneRT.samples !== p.msaa) { sceneRT.samples = p.msaa; sceneRT.dispose(); }
}

export function addShake(amount: number): void { rig.shake = Math.min(1.2, rig.shake + amount); }
export function flashHurt(amount: number): void { rig.hurt = Math.min(1, rig.hurt + amount); }
export function setZoom(z: number): void { rig.targetZoom = clamp(z, CAMERA.minZoom, CAMERA.maxZoom); }
/** 
otches = mouse-wheel steps (positive = zoom out). */
export function zoomBy(notches: number): void { rig.targetZoom = clamp(rig.targetZoom * CAMERA.zoomStep ** notches, CAMERA.minZoom, CAMERA.maxZoom); }

/** Middle-drag orbit: dragging right turns the world right (the camera swings left). */
export function orbitBy(px: number): void { rig.targetYaw -= px * CAMERA.orbitSpeed; }
/** Camera yaw in radians: screen-up is world (-sin, -cos) on XZ. */
export const cameraYaw = (): number => rig.yaw;

export function updateCamera(dt: number, focus: THREE.Vector3): void {
  const cam = G.camera;
  rig.zoom = damp(rig.zoom, rig.targetZoom, 8, dt);
  rig.focus.x = damp(rig.focus.x, focus.x, CAMERA.follow, dt);
  rig.focus.z = damp(rig.focus.z, focus.z, CAMERA.follow, dt);
  rig.focus.y = 0;
  rig.yaw = damp(rig.yaw, rig.targetYaw, 18, dt);
  const d = CAMERA.distance * rig.zoom;
  // tilt towards the horizon as we zoom in
  const k = clamp((rig.zoom - CAMERA.minZoom) / (1 - CAMERA.minZoom), 0, 1);
  const pitch = CAMERA.closePitch + (CAMERA.pitch - CAMERA.closePitch) * k;
  const lookY = 0.6 + (1 - k) * 0.7;
  const r = Math.cos(pitch) * d;
  cam.position.set(rig.focus.x + Math.sin(rig.yaw) * r, Math.sin(pitch) * d, rig.focus.z + Math.cos(rig.yaw) * r);
  if (rig.shake > 0.001) {
    const s = rig.shake * rig.shake * 0.6;
    const t = G.time * 60;
    cam.position.x += Math.sin(t * 1.3) * s;
    cam.position.y += Math.sin(t * 1.7 + 1) * s * 0.6;
    cam.position.z += Math.sin(t * 1.1 + 2) * s;
  }
  rig.shake = Math.max(0, rig.shake - dt * 2.2);
  rig.hurt = Math.max(0, rig.hurt - dt * 1.6);
  cam.lookAt(rig.focus.x, lookY, rig.focus.z);
}

export function render(): void {
  grade.uniforms.uTime.value = G.time;
  grade.uniforms.uHurt.value = rig.hurt;
  gl.setRenderTarget(sceneRT);
  gl.render(G.scene, G.camera);
  composer.render();
}
