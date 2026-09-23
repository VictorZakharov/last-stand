// Entry point: boots every system, owns the main loop and the menu <-> run flow.
import * as THREE from 'three';
import { G } from './state';
import { initRenderer, updateCamera, render, zoomBy, orbitBy, setZoom, sceneTarget } from './core/renderer';
import { CAMERA, LOBBY } from './data/balance';
import { initInput, updateInputRay, endInputFrame, input, wasPressed } from './core/input';
import { initAudio } from './core/audio';
import { updateTimers } from './core/timers';
import { particles } from './fx/particles';
import { initLights, updateLights } from './fx/lights';
import { initEffects, updateEffects } from './fx/effects';
import { buildArena } from './world/arena';
import { separateEnemies } from './world/collision';
import { Player } from './entities/player';
import { updateEnemies, clearEnemies } from './entities/enemy';
import { spawnEnemy } from './entities/spawner';
import { updateProjectiles } from './combat/projectiles';
import { updateDrops } from './loot/drops';
import { loadProfile } from './loot/profile';
import { initRun, startRun, updateRun, continueRun, bankRun, abandonRun } from './game/run';
import { initFloaters, updateFloaters } from './ui/floaters';
import { initHud, showHud, buildHotbar, banner, showDecision, hideDecision, updateHud, renderSpoils } from './ui/hud';
import { initMenus, showMenu, showSummary, hideSummary, showPause, toggleMenuStowed } from './ui/menus';
import { hideTooltip } from './ui/tooltip';
import { initUIScale } from './ui/scale';
import { initLoadoutEditor } from './ui/loadoutEditor';
import { initItemIcons } from './ui/itemIcons';
import { initPerfHud, perfBeginFrame, perfEndFrame, perfSplit, perfLap } from './ui/perfHud';
import { warmShaders } from './game/warmup';
import { initQuality, sampleQuality } from './core/quality';
import { pinPrograms, markLoaded, warmUp } from './core/shaders';
import { configureCapeEnvironment } from './vendor/cape/world/caveProfile';
import { groundHeight } from './world/arena';
import { loadingStep, loadingDone, loadingFailed } from './ui/loading';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;
const timer = new THREE.Timer();
let revealed = false;   // loading screen gone: the game may advance

async function boot() {
  await loadingStep('Forging the arena', 0.08);
  initUIScale();
  initItemIcons();
  const { scene, renderer } = initRenderer($('#game'));
  initInput(renderer.domElement);
  particles.init(scene);
  initLights(scene);
  initEffects();
  G.arena = buildArena(scene, renderer);
  configureCapeEnvironment({ groundHeight });
  initQuality();
  initFloaters($('#floaters'));

  await loadingStep('Summoning the hero', 0.35);
  initAudio();   // resumed by the first user gesture
  G.profile = loadProfile();
  G.player = new Player(G.profile.classId, G.profile.equipped);

  initHud();
  initPerfHud(renderer);
  buildHotbar(G.player);
  initRun({ banner, showDecision, hideDecision, showSummary });
  initMenus({ start, toMenu, resume, abandon, profileChanged });
  initLoadoutEditor(() => buildHotbar(G.player));
  $('#decision .bank').onclick = () => bankRun();
  $('#decision .cont').onclick = () => continueRun();

  const unlockAudio = () => initAudio();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // dev-only handle for debugging and automated screenshots (stripped from production builds)
  if (import.meta.env.DEV) Object.assign(window, { __G: G, __dev: { spawnEnemy, THREE } });

  await loadingStep('Conjuring foes and spells', 0.55);
  await warmShaders();
  await loadingStep('Lighting the lobby', 0.85);
  enterMenu();
  // compile the lobby's shaders before revealing the scene to avoid first-frame hitches
  await warmUp(renderer, scene, G.camera, sceneTarget());
  render();   // one full frame compiles the post-processing passes (bloom, grade...)
  pinPrograms(renderer);
  markLoaded();
  // the lobby renders behind the loading screen (to settle) but only starts moving at the
  // reveal, so its opening camera zoom is seen
  updateCamera(0, G.player.pos);
  loadingDone(() => { revealed = true; });
  requestAnimationFrame(frame);
}

// --- flow -------------------------------------------------------------------------
function enterMenu() {
  G.mode = 'menu';
  G.paused = false;
  showHud(false);
  showPause(false);
  hideSummary();
  showMenu(true);
  G.arena.setCalm(1);
  G.player.reset();
  G.player.sandbox = true;   // lobby: walk around and try skills freely
  setZoom(CAMERA.lobbyZoom);
  spawnDummies();
}

function spawnDummies() {
  clearEnemies();
  for (const [x, z] of LOBBY.dummies) spawnEnemy('dummy', new THREE.Vector3(x, 0, z));
}

function start() {
  showMenu(false);
  hideTooltip();
  showHud(true);
  buildHotbar(G.player);   // the loadout may have changed in the lobby
  G.mode = 'run';
  G.player.sandbox = false;
  setZoom(1);
  startRun();
  renderSpoils();
}

function toMenu() {
  abandonRun();
  enterMenu();
}

function resume() { G.paused = false; showPause(false); }

function abandon() {
  G.paused = false;
  showPause(false);
  toMenu();
}

function profileChanged() { G.player.recomputeStats(G.profile.equipped); G.player.reset(); }

const compileContext = () => `(${G.mode}${G.run ? ` wave ${G.run.wave}` : ''}, t=${G.time.toFixed(1)}s, ${G.enemies.length} foes)`;

// --- loop ---------------------------------------------------------------------------
function handleGlobalKeys() {
  if (G.mode === 'menu' && !G.paused && wasPressed('space')) toggleMenuStowed();
  if (wasPressed('escape')) {
    const r = G.run;
    if (G.mode === 'run' && r && (r.phase === 'banked' || r.phase === 'dead')) return;
    G.paused = !G.paused;
    showPause(G.paused);
  }
  if (G.mode !== 'run') return;
  if (!G.paused && G.run?.phase === 'cleared') {
    if (wasPressed('b')) bankRun();
    if (wasPressed('c')) continueRun();
  }
}

// perfLap() marks the end of each stage for the performance report's breakdown
function update(dt: number): void {
  perfLap();
  updateInputRay();
  if (input.wheel && !input.mouse.overUI) zoomBy(input.wheel);
  if (input.orbit) orbitBy(input.orbit);

  // the player can move and cast in both the arena and the lobby (sandbox)
  G.player.update(dt); perfLap('player');
  updateProjectiles(dt); perfLap('projectiles');
  // enemies in the arena, training dummies in the lobby
  if (G.mode === 'run') updateRun(dt);
  updateEnemies(dt);
  separateEnemies(); perfLap('enemies');
  if (G.mode === 'run') {
    updateDrops(dt);
    updateHud(); perfLap('hud');
  }
  updateCamera(dt, G.player.pos);

  G.arena.update(dt, G.time); perfLap('arena');
  updateEffects(dt); perfLap('effects');
  updateLights(dt); perfLap('lights');
  particles.update(dt); perfLap('particles');
  updateTimers(dt); perfLap('timers');
  updateFloaters(dt); perfLap('floaters');
}

function frame(timestamp: number): void {
  requestAnimationFrame(frame);
  perfBeginFrame(timestamp);
  timer.update(timestamp);
  const rawDt = timer.getDelta();
  const dt = Math.min(rawDt, 1 / 20);
  if (revealed) handleGlobalKeys();
  const t0 = performance.now();
  if (!G.paused && revealed) {
    sampleQuality(rawDt);
    G.dt = dt;
    G.time += dt;
    update(dt);
  }
  const t1 = performance.now();
  render();
  perfSplit(t1 - t0, performance.now() - t1);
  pinPrograms(G.renderer, compileContext);
  endInputFrame();
  perfEndFrame();
}

boot().catch((e) => { console.error(e); loadingFailed(e); });
