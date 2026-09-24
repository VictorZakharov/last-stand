// Entry point: boots every system, owns the main loop and the menu <-> run flow.
import * as THREE from 'three';
import { G } from './state';
import { initRenderer, updateCamera, render, zoomBy, orbitBy, lookBy, setZoom, sceneTarget, setViewShift, setView, viewMode, viewSettled, VIEWS, type ViewMode } from './core/renderer';
import { CAMERA, LOBBY } from './data/balance';
import { initInput, updateInputRay, endInputFrame, input, isDown, wasPressed, wantPointerLock, pointerLocked, onPointerLockLost, lockLostAt, releaseInput } from './core/input';
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
import { initRun, startRun, updateRun, continueRun, bankRun, abandonRun, playerOut, hostLeft, endRun } from './game/run';
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
import { preloadTextures } from './core/textures';
import { initSync } from './net/sync';
import { initSession, joinRoom, invitedRoom, sendLook, sendLobby, sendStart, sendControl, syncAway, updateSession, partnerInRun } from './net/session';
import { isCoop, isGuest, isHost, simulates } from './net/role';
import { initCoop, renderCoop, updateCoopHud, touchReviving } from './ui/coop';
import type { BiomeId } from './data/biomes';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;
const timer = new THREE.Timer();
let revealed = false;   // loading screen gone: the game may advance

async function boot() {
  await loadingStep('Forging the arena', 0.08);
  // the ground, wall and bark maps are made in workers meanwhile (they'd block the page for a second)
  const textures = preloadTextures();
  initUIScale();
  initItemIcons();
  const { scene, renderer } = initRenderer($('#game'));
  initInput(renderer.domElement);
  particles.init(scene);
  initLights(scene);
  initEffects();
  await textures;
  G.arena = await buildArena(scene, renderer);
  initQuality();
  initFloaters($('#floaters'));

  await loadingStep('Summoning the hero', 0.35);
  initAudio();   // resumed by the first user gesture
  G.profile = loadProfile(savedClass());
  G.player = new Player(G.profile.classId, G.profile.equipped);
  G.players = [G.player];

  initHud();
  initTouch();
  initPerfHud(renderer);
  buildHotbar(G.player);
  initRun({ banner, showDecision, hideDecision, showSummary });
  initMenus({ start, toMenu, resume, abandon, profileChanged, switchClass, summaryDone, lobbyChanged: sendLobbyChoice });
  initSync();
  initSession({ startRun: guestStart, hostGone, changed: () => { renderCoop(); sendLobbyChoice(); } });
  initCoop();
  // losing the pointer mid-wave (Esc, switching windows) pauses, as mouse look can't carry on
  onPointerLockLost(() => { if (G.mode === 'run' && !G.menuOpen) openPause(true); });
  initLoadoutEditor(() => buildHotbar(G.player));
  initPwa();
  $('#decision .bank').onclick = () => chooseBank();
  $('#decision .cont').onclick = () => chooseContinue();

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
  loadingDone(() => {
    revealed = true;
    // an invite link: straight into the friend's room
    const room = invitedRoom();
    if (room) void joinRoom(room);
  });
  requestAnimationFrame(frame);
}

// --- flow -------------------------------------------------------------------------
function enterMenu() {
  G.mode = 'menu';
  G.paused = G.menuOpen = G.player.idle = false;
  releaseInput();
  runOver = false;
  showHud(false);
  showPause(false);
  hideSummary();
  showMenu(true);
  G.arena.setCalm(1);
  syncAway();
  for (const p of G.players) p.reset();
  G.player.sandbox = true;   // lobby: walk around and try skills freely
  setZoom(CAMERA.lobbyZoom);
  spawnDummies();
  renderCoop();
}

function spawnDummies() {
  clearEnemies();
  for (const [x, z] of LOBBY.dummies) spawnEnemy('dummy', new THREE.Vector3(x, 0, z));
}

/** The lobby's start: solo, or the host (whose guests come along). A guest waits for the host. */
function start() {
  if (isGuest() || (isHost() && partnerInRun())) return;
  rollBiome();
  sendStart(G.arena.biome, selectedWave());
  beginRun(selectedWave());
}

/** A guest: the host started a run. */
function guestStart(biome: BiomeId, wave: number) {
  G.arena.setBiome(biome);
  beginRun(wave);
}

function beginRun(wave: number) {
  showMenu(false);
  hideTooltip();
  showHud(true);
  buildHotbar(G.player);   // the loadout may have changed in the lobby
  G.mode = 'run';
  G.player.sandbox = false;
  syncAway();
  setZoom(1);
  startRun(wave);
  renderSpoils();
}

function toMenu() {
  abandonRun();
  enterMenu();
}

/** The host's battleground and starting wave, shown in the guests' lobbies. */
function sendLobbyChoice() {
  if (!isGuest()) sendLobby(G.arena.biome, selectedWave());
}

/** The summary closed: back to the lobby, or (in co-op, with the run still on) watch the others. */
function summaryDone() {
  if (G.run && G.run.phase !== 'over' && G.players.some((p) => !p.local && p.inRun)) { hideSummary(); return; }
  toMenu();
}

/** The host left mid-run: the guest keeps its spoils. */
function hostGone() {
  if (G.mode === 'run') hostLeft();
}

// --- choices -------------------------------------------------------------------------
function chooseBank() {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active) return;
  if (isGuest()) sendControl({ t: 'bank' });
  bankRun();
}

function chooseContinue() {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active || r.votes.has(G.player.slot)) return;
  if (isGuest()) sendControl({ t: 'vote' });
  continueRun();
}

/** The pause menu. Solo it stops the game; in co-op the game goes on and the character stands idle. */
function openPause(open: boolean) {
  G.menuOpen = open;
  G.paused = open && !isCoop();
  G.player.idle = open && isCoop();
  showPause(open);
}

function resume() { openPause(false); }

/** Abandon from the pause menu: solo back to the lobby; in co-op out of the run (spoils lost), watching the rest. */
function abandon() {
  openPause(false);
  if (!isCoop() || G.mode !== 'run' || !G.run || G.run.phase === 'over' || !G.player.inRun) { toMenu(); return; }
  if (isGuest()) sendControl({ t: 'abandon' });
  if (G.player.alive) G.player.die();
  playerOut(G.player, 'dead');
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
  const old = G.player;
  G.player = new Player(id, G.profile.equipped);
  G.player.slot = old.slot;
  G.player.spawn.copy(old.spawn);
  G.players[G.players.indexOf(old)] = G.player;
  G.player.place(at, facing);
  G.player.sandbox = true;
  buildHotbar(G.player);
  sendLook();
}

// gear can change what a key fires (a shield skill falls back without one), so the hotbar is rebuilt.
// The hero stays where it stands (the lobby can be practised in)
function profileChanged() {
  const p = G.player, at = p.pos.clone(), facing = p.facing;
  p.recomputeStats(G.profile.equipped);
  p.reset();
  p.place(at, facing);
  buildHotbar(p);
  sendLook();
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
  const look = v !== 'top' && !G.menuOpen && G.player.active && (phase === 'countdown' || phase === 'fighting' || phase === 'cleared');
  wantPointerLock(look);
  crosshair.classList.toggle('hidden', v === 'top');
  lookHint.classList.toggle('hidden', !look || pointerLocked());
}

// --- loop ---------------------------------------------------------------------------
function handleGlobalKeys() {
  if (G.mode === 'menu' && !G.menuOpen && wasPressed('space')) toggleMenuStowed();
  // the Esc that released the mouse-look pointer already paused the game
  if (wasPressed('escape') && performance.now() - lockLostAt < 300) return;
  if (wasPressed('escape')) {
    // out of the run, the summary (or the watching) has no pause
    if (G.mode === 'run' && G.run && !G.player.inRun) return;
    openPause(!G.menuOpen);
  }
  if (G.mode !== 'run') return;
  if (!G.menuOpen && wasPressed('v')) runView = VIEWS[(VIEWS.indexOf(runView) + 1) % VIEWS.length];
  if (!G.menuOpen && G.run?.phase === 'cleared') {
    if (wasPressed('b')) chooseBank();
    if (wasPressed('c')) chooseContinue();
  }
}

/** Who the camera follows: the local player, or once out of a co-op run, a partner still in it. */
function focusPlayer() {
  if (G.mode !== 'run' || G.player.inRun) return G.player;
  return G.players.find((p) => !p.local && p.inRun) ?? G.player;
}

/** The run is over for everyone: once the summary is closed, back to the lobby. */
let runOver = false;
function checkRunOver() {
  const r = G.run;
  if (!r || G.mode !== 'run') return;
  // the host (or solo) ends the run once nobody is left in it
  if (!isGuest() && r.phase !== 'over' && !G.players.some((p) => p.inRun)) endRun();
  if (r.phase !== 'over' || runOver || !r.summarized || !$('#summary').classList.contains('hidden')) return;
  runOver = true;
  banner('The run is over', 'Back to the sanctuary');
  setTimeout(() => { if (G.mode === 'run' && runOver) toMenu(); }, 2500);
}

// perfLap() marks the end of each stage for the performance report's breakdown
function update(dt: number): void {
  perfLap();
  updateInputRay();
  if (input.wheel && !input.mouse.overUI) zoomBy(input.wheel);
  if (input.orbit) orbitBy(input.orbit);
  if (input.look.x || input.look.y) lookBy(input.look.x, input.look.y);

  // the player can move and cast in both the arena and the lobby (sandbox); co-op partners as reported
  G.player.reviving = G.mode === 'run' && !G.menuOpen && (isDown('e') || touchReviving());
  for (const p of G.players) p.update(dt);
  perfLap('player');
  updateProjectiles(dt); perfLap('projectiles');
  // enemies in the arena, training dummies in the lobby
  if (G.mode === 'run') { updateRun(dt); checkRunOver(); }
  updateEnemies(dt);
  if (simulates()) separateEnemies();
  perfLap('enemies');
  updateSession(dt, G.player.reviving);
  if (G.mode === 'run') {
    updateHud();
    updateCoopHud();
    perfLap('hud');
  }
  const vs = lobbyViewShift();
  setViewShift(vs.x, vs.y);
  const focus = focusPlayer();
  updateCamera(dt, focus.pos, focus.model.height);
  // through the eyes the body would fill the view (it still casts, animates and blocks)
  G.player.model.root.visible = !(focus === G.player && viewMode() === 'first' && viewSettled());


  G.arena.update(dt, G.time); perfLap('arena');
  updateEffects(dt); perfLap('effects');
  updateLights(dt); perfLap('lights');
  particles.update(dt); perfLap('particles');
  updateTimers(dt); perfLap('timers');
  updateFloaters(dt); perfLap('floaters');
}

/**
 * A co-op host's game runs the fight for everyone, so it can't stop when its tab goes to the
 * background (the browser stops drawing it): a timer steps it meanwhile. Browsers slow such
 * timers down to about once a second, so each tick catches up in short steps.
 */
let lastStep = 0;
function backgroundStep(): void {
  const now = performance.now();
  if (!document.hidden || !isHost() || !revealed || G.paused) { lastStep = now; return; }
  let left = Math.min(1.5, (now - lastStep) / 1000);
  lastStep = now;
  while (left > 1e-3) {
    const dt = Math.min(left, 1 / 20);
    G.dt = dt;
    G.time += dt;
    update(dt);
    left -= dt;
  }
}
setInterval(backgroundStep, 100);

function frame(timestamp: number): void {
  requestAnimationFrame(frame);
  lastStep = performance.now();

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
