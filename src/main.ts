// Entry point: boots every system, owns the main loop and the menu <-> run flow.
import * as THREE from 'three';
import { G } from './state';
import { initRenderer, updateCamera, render, zoomBy, orbitBy, lookBy, setZoom, sceneTarget, setViewShift, setView, viewMode, viewSettled, VIEWS, type ViewMode } from './core/renderer';
import { CAMERA, LOBBY } from './data/balance';
import { initInput, updateInputRay, endInputFrame, input, wasPressed, wantPointerLock, pointerLocked, onPointerLockLost, lockLostAt } from './core/input';
import { initAudio } from './core/audio';
import { updateTimers } from './core/timers';
import { particles } from './fx/particles';
import { initLights, updateLights, clearLights } from './fx/lights';
import { initEffects, updateEffects, clearEffects } from './fx/effects';
import { buildArena } from './world/arena';
import { separateEnemies } from './world/collision';
import { Player } from './entities/player';
import { updateEnemies, clearEnemies } from './entities/enemy';
import { spawnEnemy } from './entities/spawner';
import { updateProjectiles, clearProjectiles } from './combat/projectiles';
import { loadProfile, savedClass, saveClass } from './loot/profile';
import { initRun, startRun, updateRun, continueRun, bankRun, abandonRun } from './game/run';
import { initFloaters, updateFloaters } from './ui/floaters';
import { initHud, showHud, buildHotbar, banner, showDecision, hideDecision, updateHud, renderSpoils } from './ui/hud';
import { initMenus, showMenu, showSummary, hideSummary, showPause, toggleMenuStowed, selectedWave, lobbyViewShift } from './ui/menus';
import { hideTooltip } from './ui/tooltip';
import { initUIScale } from './ui/scale';
import { initLoadoutEditor } from './ui/loadoutEditor';
import { initTouch, updateTouch } from './ui/touch';
import { initPwa } from './ui/pwa';
import { initItemIcons } from './ui/itemIcons';
import { initPerfHud, perfBeginFrame, perfEndFrame, perfSplit, perfLap } from './ui/perfHud';
import { warmShaders } from './game/warmup';
import { initQuality, sampleQuality } from './core/quality';
import { pinPrograms, markLoaded, warmUp } from './core/shaders';
import { initBiome, rollBiome } from './game/biome';
import { BIOME_IDS } from './data/biomes';
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
  initQuality();
  initFloaters($('#floaters'));

  await loadingStep('Summoning the hero', 0.35);
  initAudio();   // resumed by the first user gesture
  G.profile = loadProfile(savedClass());
  G.player = new Player(G.profile.classId, G.profile.equipped);

  initHud();
  initTouch();
  initPerfHud(renderer);
  buildHotbar(G.player);
  initRun({ banner, showDecision, hideDecision, showSummary });
  initMenus({ start, toMenu, resume, abandon, profileChanged, switchClass });
  // losing the pointer mid-wave (Esc, switching windows) pauses, as mouse look can't carry on
  onPointerLockLost(() => { if (G.mode === 'run' && !G.paused) { G.paused = true; showPause(true); } });
  initLoadoutEditor(() => buildHotbar(G.player));
  initPwa();
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
  // compile the lobby's shaders (every biome's) before revealing the scene to avoid hitches
  for (const id of BIOME_IDS) { G.arena.setBiome(id); await warmUp(renderer, scene, G.camera, sceneTarget()); }
  initBiome();
  render();   // one full frame compiles the post-processing passes (bloom, grade...)
  pinPrograms(renderer);
  markLoaded();
  // the lobby renders behind the loading screen (to settle) but only starts moving at the
  // reveal, so its opening camera zoom is seen
  updateCamera(0, G.player.pos, G.player.model.height);
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
  rollBiome();
  setZoom(1);
  startRun(selectedWave());
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

/** Lobby class pick: the new class brings its own profile (gear, stash, records) and loadout. */
function switchClass(id: string) {
  if (G.mode !== 'menu' || id === G.player.cls.id) return;
  saveClass(id);
  // the new hero takes the old one's place: a swap in place, not a respawn
  const at = G.player.pos.clone(), facing = G.player.facing;
  G.player.dispose();
  // the old class's skill visuals go with it
  clearProjectiles(); clearEffects(); clearLights(); particles.clear();
  G.profile = loadProfile(id);
  G.player = new Player(id, G.profile.equipped);
  G.player.place(at, facing);
  G.player.sandbox = true;
  buildHotbar(G.player);
}

// gear can change what a key fires (a shield skill falls back without one), so the hotbar is rebuilt.
// The hero stays where it stands (the lobby can be practised in)
function profileChanged() {
  const p = G.player, at = p.pos.clone(), facing = p.facing;
  p.recomputeStats(G.profile.equipped);
  p.reset();
  p.place(at, facing);
  buildHotbar(p);
}

const compileContext = () => `(${G.mode}${G.run ? ` wave ${G.run.wave}` : ''}, t=${G.time.toFixed(1)}s, ${G.enemies.length} foes)`;

// --- views ------------------------------------------------------------------------
/** the run's view, cycled with V (the lobby, and touch play, stay top-down) */
let runView: ViewMode = 'top';
const crosshair = document.getElementById('crosshair')!, lookHint = document.getElementById('look-hint')!;

function syncView(): void {
  const v = G.mode === 'run' && !input.touchMode ? runView : 'top';
  setView(v);
  input.centerAim = v !== 'top';
  // mouse look holds the pointer through the run, the bank-or-continue choice included (B / C
  // pick there), and lets go for the pause menu and the run's end
  const phase = G.run?.phase;
  const look = v !== 'top' && !G.paused && G.player.alive && (phase === 'countdown' || phase === 'fighting' || phase === 'cleared');
  wantPointerLock(look);
  crosshair.classList.toggle('hidden', v === 'top');
  lookHint.classList.toggle('hidden', !look || pointerLocked());
}

// --- loop ---------------------------------------------------------------------------
function handleGlobalKeys() {
  if (G.mode === 'menu' && !G.paused && wasPressed('space')) toggleMenuStowed();
  // the Esc that released the mouse-look pointer already paused the game
  if (wasPressed('escape') && performance.now() - lockLostAt < 300) return;
  if (wasPressed('escape')) {
    const r = G.run;
    if (G.mode === 'run' && r && (r.phase === 'banked' || r.phase === 'dead')) return;
    G.paused = !G.paused;
    showPause(G.paused);
  }
  if (G.mode !== 'run') return;
  if (!G.paused && wasPressed('v')) runView = VIEWS[(VIEWS.indexOf(runView) + 1) % VIEWS.length];
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
  if (input.look.x || input.look.y) lookBy(input.look.x, input.look.y);

  // the player can move and cast in both the arena and the lobby (sandbox)
  G.player.update(dt); perfLap('player');
  updateProjectiles(dt); perfLap('projectiles');
  // enemies in the arena, training dummies in the lobby
  if (G.mode === 'run') updateRun(dt);
  updateEnemies(dt);
  separateEnemies(); perfLap('enemies');
  if (G.mode === 'run') {
    updateHud(); perfLap('hud');
  }
  const vs = lobbyViewShift();
  setViewShift(vs.x, vs.y);
  updateCamera(dt, G.player.pos, G.player.model.height);
  // through the eyes the body would fill the view (it still casts, animates and blocks)
  G.player.model.root.visible = !(viewMode() === 'first' && viewSettled());

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
  if (revealed) { updateTouch(dt); handleGlobalKeys(); syncView(); }
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
