// Graphics quality: the player's setting (auto / high / medium / low, cookie) and the
// level in effect. Auto starts from the level it last settled on and steps down while
// the frame rate stays low; it never steps back up on its own, to avoid oscillating.
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY, QUALITY_ORDER, AUTO_QUALITY, type QualityLevel, type QualitySetting } from '../data/quality';
import { setRenderQuality } from './renderer';
import { readCookie, writeCookie } from './cookies';
import { setHeroDetail } from '../entities/models/armor';

const COOKIE = 'last-stand-quality';
const AUTO_COOKIE = 'last-stand-quality-auto';   // level auto settled on (next session starts there)

let setting: QualitySetting = 'auto';
let level: QualityLevel = 'high';
let frames = 0, time = 0, settle = 0;

const isLevel = (v: string | null): v is QualityLevel => v !== null && v in QUALITY;

export function initQuality(): void {
  const saved = readCookie(COOKIE);
  setting = saved === 'auto' || isLevel(saved) ? saved : 'auto';
  const autoLevel = readCookie(AUTO_COOKIE);
  apply(setting === 'auto' ? (isLevel(autoLevel) ? autoLevel : 'high') : setting);
}

export const qualitySetting = (): QualitySetting => setting;
export const qualityLevel = (): QualityLevel => level;

export function setQuality(s: QualitySetting): void {
  setting = s;
  writeCookie(COOKIE, s);
  // choosing Auto again starts over from the top
  if (s === 'auto') writeCookie(AUTO_COOKIE, 'high');
  apply(s === 'auto' ? 'high' : s);
}

function apply(l: QualityLevel): void {
  level = l;
  const p = QUALITY[l];
  setRenderQuality(p);
  setHeroDetail(p.heroDetail);
  const shadow = G.arena.moon.shadow;
  if (shadow.mapSize.x !== p.shadowMap) {
    shadow.mapSize.set(p.shadowMap, p.shadowMap);
    shadow.map?.dispose();
    shadow.map = null;   // recreated at the new size on the next render
  }
  for (const p of G.players) applyShadowDetail(p.obj);
  for (const e of G.enemies) applyShadowDetail(e.obj);
  frames = time = 0;
  settle = AUTO_QUALITY.settle;
}

const _s = new THREE.Vector3();
/** Small character parts barely show in the shadow map, but each caster is a shadow draw call. */
export function applyShadowDetail(root: THREE.Object3D): void {
  const min = QUALITY[level].minCasterRadius;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(m.userData.casts ??= m.castShadow)) return;   // remember the model's own choice
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    m.getWorldScale(_s);
    m.castShadow = m.geometry.boundingSphere!.radius * Math.max(_s.x, _s.y, _s.z) >= min;
  });
}

/** Feed the real (unclamped) frame delta each frame while the game is running. */
export function sampleQuality(dt: number): void {
  if (setting !== 'auto' || level === 'low') return;
  if (dt > 0.25) return;                 // tab switch, breakpoint: not a performance signal
  if (settle > 0) { settle -= dt; return; }   // let a level change take effect first
  frames++; time += dt;
  if (time < AUTO_QUALITY.window) return;
  if (frames / time < AUTO_QUALITY.minFps) {
    const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(level) + 1];
    writeCookie(AUTO_COOKIE, next);
    apply(next);
  }
  frames = time = 0;
}
