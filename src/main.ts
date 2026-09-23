// Entry point: boots every system, owns the main loop and the menu <-> run flow.
import * as THREE from 'three';
import { G } from './state';
import { initRenderer, updateCamera, render, zoomBy, setZoom } from './core/renderer';
import { CAMERA } from './data/balance';
import { initInput, updateInputRay, endInputFrame, input, wasPressed } from './core/input';
import { initAudio } from './core/audio';
import { updateTimers } from './core/timers';
import { particles } from './fx/particles';
import { initLights, updateLights } from './fx/lights';
import { initEffects, updateEffects } from './fx/effects';
import { buildArena } from './world/arena';
import { separateEnemies } from './world/collision';
import { Player } from './entities/player';
import { updateEnemies } from './entities/enemy';
import { spawnEnemy } from './entities/spawner';
import { updateProjectiles } from './combat/projectiles';
import { updateDrops } from './loot/drops';
import { loadProfile } from './loot/profile';
import { initRun, startRun, updateRun, continueRun, bankRun, abandonRun } from './game/run';
import { initFloaters, updateFloaters } from './ui/floaters';
import { initHud, showHud, buildHotbar, banner, showDecision, hideDecision, updateHud, renderSpoils } from './ui/hud';
import { initMenus, showMenu, showSummary, hideSummary, showPause } from './ui/menus';
import { hideTooltip } from './ui/tooltip';
import { initUIScale } from './ui/scale';
import { initLoadoutEditor } from './ui/loadoutEditor';
import { configureCapeEnvironment } from './vendor/cape/world/caveProfile';
import { groundHeight } from './world/arena';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;
const timer = new THREE.Timer();

function boot() {
  initUIScale();
  const { scene, renderer } = initRenderer($('#game'));
  initInput(renderer.domElement);
  particles.init(scene);
  initLights(scene);
  initEffects();
  G.arena = buildArena(scene, renderer);
  configureCapeEnvironment({ groundHeight });
  initFloaters($('#floaters'));

  G.profile = loadProfile();
  G.player = new Player(G.profile.classId, G.profile.equipped);

  initHud();
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

  enterMenu();
  // compile shaders before revealing the scene to avoid first-frame hitches
  renderer.compile(scene, G.camera);
  requestAnimationFrame(() => $('#loading').classList.add('done'));
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

// --- loop ---------------------------------------------------------------------------
function handleGlobalKeys() {
  if (G.mode !== 'run') return;
  if (wasPressed('escape')) {
    const r = G.run;
    if (r && (r.phase === 'banked' || r.phase === 'dead')) return;
    G.paused = !G.paused;
    showPause(G.paused);
  }
  if (!G.paused && G.run?.phase === 'cleared') {
    if (wasPressed('b')) bankRun();
    if (wasPressed('c')) continueRun();
  }
}

function update(dt: number): void {
  updateInputRay();
  if (input.wheel && !input.mouse.overUI) zoomBy(input.wheel);

  // the player can move and cast in both the arena and the lobby (sandbox)
  G.player.update(dt);
  updateProjectiles(dt);
  if (G.mode === 'run') {
    updateRun(dt);
    updateEnemies(dt);
    separateEnemies();
    updateDrops(dt);
    updateHud();
  }
  updateCamera(dt, G.player.pos);

  G.arena.update(dt, G.time);
  updateEffects(dt);
  updateLights(dt);
  particles.update(dt);
  updateTimers(dt);
  updateFloaters(dt);
}

function frame(timestamp: number): void {
  requestAnimationFrame(frame);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  handleGlobalKeys();
  if (!G.paused) {
    G.dt = dt;
    G.time += dt;
    update(dt);
  }
  render();
  endInputFrame();
}

boot();
