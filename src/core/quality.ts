// Graphics quality: the player's setting (auto / high / medium / low, cookie) and the
// level in effect. Auto starts from the level it last settled on and steps down while
// the frame rate stays low, High's resolution first (from the screen's own pixels, on
// any device and at any of the OS's scaling: what the hardware holds is measured), then
// the levels, then Low's resolution; it never steps back up on its own, to avoid
// oscillating.
import * as THREE from 'three';
import { G } from '../state';
import { QUALITY, QUALITY_ORDER, AUTO_QUALITY, type QualityLevel, type QualitySetting } from '../data/quality';
import { scenePixels, setRenderQuality } from './renderer';

/** pixels within this share over a floor are at it: a step to it would change nothing you'd see */
const AT_FLOOR = 1.05;
import { readCookie, writeCookie } from './cookies';
import { setHeroDetail } from '../entities/models/armor';
import { setRubbleShadows } from '../fx/rubble';
import { setReliefSteps } from './parallax';

const COOKIE = 'last-stand-quality';
// what Auto settled on, the next session starting there: its level, and the most pixels it lets the scene render
// (`high@4147200`: a budget measured in pixels holds on a screen of any size or pixel ratio)
const AUTO_COOKIE = 'last-stand-quality-auto';

let setting: QualitySetting = 'auto';
let level: QualityLevel = 'high';
/** the most pixels Auto lets the scene render (Infinity: as many as the level's resolution gives) */
let budget = Infinity;
let frames = 0, time = 0, settle = 0;

const isLevel = (v: string | null): v is QualityLevel => v !== null && v in QUALITY;

/** Auto's level and budget from its cookie (`high`, `high@4147200`), the top when there's none. */
function readAuto(): { level: QualityLevel; budget: number } {
  const [saved, pixels] = (readCookie(AUTO_COOKIE) ?? '').split('@');
  const most = Number(pixels);
  return { level: isLevel(saved) ? saved : 'high', budget: most > 0 ? most : Infinity };
}

function writeAuto(): void {
  writeCookie(AUTO_COOKIE, budget === Infinity ? level : `${level}@${Math.round(budget)}`);
}

export function initQuality(): void {
  const saved = readCookie(COOKIE);
  setting = saved === 'auto' || isLevel(saved) ? saved : 'auto';
  const auto = readAuto();
  if (setting === 'auto') apply(auto.level, auto.budget);
  else apply(setting);
}

export const qualitySetting = (): QualitySetting => setting;
export const qualityLevel = (): QualityLevel => level;
/** The most pixels Auto lets the scene render (Infinity: no budget). */
export const qualityBudget = (): number => budget;

export function setQuality(s: QualitySetting): void {
  setting = s;
  writeCookie(COOKIE, s);
  apply(s === 'auto' ? 'high' : s);
  // choosing Auto again starts over from the top
  if (s === 'auto') writeAuto();
}

function apply(l: QualityLevel, most = Infinity): void {
  level = l;
  budget = most;
  const p = QUALITY[l];
  setRenderQuality(p, most);
  setHeroDetail(p.heroDetail);
  const shadow = G.arena.moon.shadow;
  if (shadow.mapSize.x !== p.shadowMap) {
    shadow.mapSize.set(p.shadowMap, p.shadowMap);
    shadow.map?.dispose();
    shadow.map = null;   // recreated at the new size on the next render
  }
  setRubbleShadows(p.minCasterRadius);
  setReliefSteps(p.relief);
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
  if (setting !== 'auto' || atBottom()) return;
  if (dt > 0.25) return;                 // tab switch, breakpoint: not a performance signal
  if (settle > 0) { settle -= dt; return; }   // let a level change take effect first
  frames++; time += dt;
  if (time < AUTO_QUALITY.window) return;
  if (frames / time < AUTO_QUALITY.minFps) {
    stepDown();
    writeAuto();
  }
  frames = time = 0;
}

/** Whether Auto has nothing left to lower: Low, at its fewest pixels (or the screen's own, if fewer). */
const atBottom = (): boolean => level === 'low' && scenePixels() <= AUTO_QUALITY.fewest * AT_FLOOR;

/** Auto's step down: High's pixels halved to `AUTO_QUALITY.highFloor`, then a level (the pixels kept), then Low's
 *  pixels halved to `AUTO_QUALITY.fewest`. */
function stepDown(): void {
  const now = scenePixels();
  if (level === 'high' && now > AUTO_QUALITY.highFloor * AT_FLOOR) {
    apply('high', Math.max(AUTO_QUALITY.highFloor, now / 2));
    return;
  }
  if (level !== 'low') {
    apply(QUALITY_ORDER[QUALITY_ORDER.indexOf(level) + 1], budget);
    return;
  }
  apply('low', Math.max(AUTO_QUALITY.fewest, now / 2));
}
