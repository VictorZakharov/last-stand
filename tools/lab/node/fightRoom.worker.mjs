// `lab fight`'s room: one fight in a worker thread of its own, as the dedicated server will run each room (the fight's
// state is the game's module-wide `G`, one fight to a thread). Loads the fight's server build, opens its battleground
// and fights it, a crowd of one foe or a run from a wave (node/fightRooms.mjs), and posts back what it took and what
// came of it.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { setImmediate as turn } from 'node:timers/promises';
import { getHeapStatistics, setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

const MB = 1e6;
/** how near a hero a foe counts as come to him (m) */
const CAME_NEAR = 4;
/** how often the party's blows land in a run (steps), and what they are: a blow at what stands by each hero, and the
 *  party's shots at every foe further off, each a share of the foe's most life (as the guests' hits come to the host) */
const STRIKE_EVERY = 10;
const STRIKES = { near: { reach: 2.5, share: 0.15 }, far: { reach: 60, share: 0.04 } };
/** how often the room gives its thread back (steps), as the server's tick does: a boss's code loads meanwhile */
const TURN_EVERY = 20;

const { bundle, biome, seed, heroes, mode, steps, dt } = workerData;
/** this room's own heap in use (its isolate's: the process's figures are every room's) */
const heapMb = () => getHeapStatistics().used_heap_size / MB;

const loadStart = performance.now();
const fight = await import(pathToFileURL(bundle).href);
const loadMs = performance.now() - loadStart;
const buildMs = fight.openFight(biome, seed, heroes);
const G = fight.fightState();

/** A crowd of `count` of `foe` round the hero, stepped: how many of those alive came to him. */
function fightCrowd({ foe, count }, stepMs) {
  fight.spawnFoes(foe, count);
  for (let step = 0; step < steps; step++) stepMs.push(fight.stepFight(dt));
  const alive = G.enemies.filter((enemy) => enemy.alive);
  /** a foe's distance to the hero nearest it (m), or Infinity with none */
  const toHero = (enemy) => Math.min(...heroes.map(([x, z]) => Math.hypot(enemy.pos.x - x, enemy.pos.z - z)));
  return { foes: G.enemies.length, alive: alive.length, cameNear: alive.filter((enemy) => toHero(enemy) < CAME_NEAR).length };
}

/** The party's blows, near and far, from every hero (a canary's party strikes nothing). */
function partyStrikes(strikes) {
  if (!strikes) return;
  for (const hero of G.players) {
    fight.strikeAround(hero.slot, STRIKES.near.reach, STRIKES.near.share);
    fight.strikeAround(hero.slot, STRIKES.far.reach, STRIKES.far.share);
  }
}

/** A run from `wave`, the party striking and voting to continue after each wave: the waves cleared and the bosses that
 *  came and fell. */
async function fightRun({ wave, strikes }, stepMs) {
  fight.beginWaves(wave);
  const bosses = new Map();
  let cleared = 0;
  let wasCleared = false;
  for (let step = 0; step < steps; step++) {
    if (step % STRIKE_EVERY === 0) partyStrikes(strikes);
    fight.continueAll();
    if (step % TURN_EVERY === 0) await turn();
    stepMs.push(fight.stepFight(dt));
    for (const enemy of G.enemies) if (enemy.boss) bosses.set(enemy.id, { name: enemy.name, fell: !enemy.alive });
    const isCleared = G.run.phase === 'cleared';
    if (isCleared && !wasCleared) cleared++;
    wasCleared = isCleared;
  }
  return { from: wave, reached: G.run.wave, cleared, kills: G.run.kills, bosses: [...bosses.values()] };
}

const stepMs = [];
const outcome = mode.run ? await fightRun(mode.run, stepMs) : fightCrowd(mode.crowd, stepMs);

const unCollectedMb = heapMb();
// (what the room keeps, the build's garbage collected: a worker takes no `--expose-gc`, so the flag is set here and
// the collector fetched from a fresh context, where it's then defined)
setFlagsFromString('--expose-gc');
runInNewContext('gc')();
parentPort.postMessage({ loadMs, buildMs, heapMb: unCollectedMb, keptMb: heapMb(), stepMs, ...outcome });
