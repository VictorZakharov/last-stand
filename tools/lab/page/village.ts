// `lab village`: the village the lobby stands in, as a player walks it (tools/lab). The run is left for the lobby, and:
// every object is usable from where the hero stands to use it; his skills cast in the training yard and nowhere else;
// no straight walk out from inside the palisade or along a way out leaves the village; none along a way out gets past
// its portal, through it or round it; the grass's rings stay put through the eyes as the view tilts; the terrace's
// stair takes him
// up to the hall; in the close view the hall's screen lets the pointer go; the first visit's training ticks off each
// step as the player takes it (the yard walked into, a dummy struck, the map opened by M, the stash and the notice
// board used), the portal's card holding its way in until it's done, and skipped it opens the portals at once; and
// no hour of the day compiles a program.
// `--canary` plants a fault for each check: an object's stand moved off it, the yard's reading taken outside it, a
// hero put past the palisade after a walk, put past a portal after a walk at it, the rings' middle moved 20 m in a
// frame, the stair walked at beside it into the terrace's wall, the pointer asked
// of the square (where mouse look holds it), the notice board never read, a new material shown at one hour; walks to
// a spot walked straight; an orb far past white hung in a lamp's lantern.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import {
  COTTAGES, ENTRANCES, HALL, TERRACE, VILLAGE_OBJECTS, YARD_DUMMIES, yardToWorld, type Spot, type VillageObject,
} from '../../../src/data/village';
import { BIOME_IDS } from '../../../src/data/biomes';
import { COTTAGE, inWay, insidePalisade, palisadePolygon } from '../../../src/world/villagePlan';
import { groundHeight } from '../../../src/world/ground';
import { focusOf } from '../../../src/world/meadow';
import { goTo, goUse, objectNear, villageObject } from '../../../src/game/village';
import { routing } from '../../../src/world/walkPath';
import { restartTraining, skipTraining, stepDone, trainingPending } from '../../../src/game/training';
import { TRAINING } from '../../../src/data/training';
import { holdHour } from '../../../src/game/clock';
import { villageMapOpen } from '../../../src/ui/villageMap';
import { closeHeroSelect, heroSelectOpen } from '../../../src/ui/heroSelect';
import { pointerWanted } from '../../../src/core/input';
import * as renderer from '../../../src/core/renderer';
import { lampsNotBlinding } from './villageLamps';

export interface VillageOptions {
  canary: boolean;
}

/** frames the hero is left to settle where he's put, and to walk to a spot or out to the village's edge */
const SETTLE = 15;
const WALK = 300;
/** frames the basic attack is held at a dummy (a bow drawn to full), and run after it's let go (the shot's flight) */
const STRIKE_HELD = 90;
const STRIKE_AFTER = 60;
/** how far a canary moves the first object's stand off it, and the yard's reading out past the yard (m) */
const STAND_OFF = 9;
const OUT_OF_YARD = 14;
/** the walks out: from how far in toward the middle each starts (a share of the palisade's distance), how many */
const WALK_IN = 0.7;
const WALKS = 16;
/** the walks at each portal: how far before it they start (m), and how far either side of its middle (m) */
const PORTAL_BEFORE = 2.5;
const PORTAL_ACROSS = [0, -2.2, 2.2, -4, 4];
/** how far past the end of a walk its target lies (m), so he never stops short of the edge on his own */
const FAR = 70;
/** the hours of the day shown, each drawn once */
const HOURS = [0, 6, 9, 12, 18, 21];

/** One check's lines, its problems, and whether its canary was caught (null: no canary ran). */
interface Checked { lines: string[]; problems: string[]; caught: boolean | null }

/** The village checked as a player walks it. */
export async function village(lab: Lab, options: VillageOptions): Promise<Report> {
  await toVillage(lab);
  const checks = [
    await objectsUsable(lab, options.canary),
    await castingInYard(lab, options.canary),
    await boundsClosed(lab, options.canary),
    await portalsHold(lab, options.canary),
    await stairClimbed(lab, options.canary),
    await hallFreesPointer(lab, options.canary),
    await grassSteady(lab, options.canary),
    await roundCottages(lab, options.canary),
    await walksAcross(lab, options.canary),
    await lampsNotBlinding(lab, options.canary),
    await training(lab, options.canary),
    await hoursCompileNothing(lab, options.canary),
  ];
  const lines = checks.flatMap((c) => c.lines);
  const caught = checks.map((c) => c.caught);
  if (!options.canary) return { text: lines.join('\n'), problems: checks.flatMap((c) => c.problems) };
  lines.push(`canaries: ${caught.filter(Boolean).length} of ${caught.length} caught`);
  const missed = caught.includes(false) ? ['canary: a planted fault went unseen'] : [];
  return { text: lines.join('\n'), problems: missed };
}

/** The run left by the pause menu, the lobby's village shown and taking the hero's input. */
async function toVillage(lab: Lab): Promise<void> {
  await lab.step(1, () => ({ keys: ['escape'] }));
  const abandon = document.getElementById('btn-abandon');
  if (!abandon) throw new Error('lab: no pause menu to leave the run by');
  abandon.click();
  await lab.until(() => G.mode === 'menu' && G.arena.place === 'village', 600, 'the run never gave way to the village');
  await lab.step(SETTLE);
}

/** The hero put at (x, z) on the ground there, still, and let settle. */
async function stand(lab: Lab, [x, z]: Spot, facing = 0): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  await lab.step(SETTLE);
}

/** The hero walked of himself toward (x, z) for `frames` frames. */
async function walkToward(lab: Lab, [x, z]: Spot, frames = WALK): Promise<void> {
  G.player.walkTo = new THREE.Vector3(x, 0, z);
  await lab.step(frames);
  G.player.walkTo = null;
}

const at = (): Spot => [G.player.pos.x, G.player.pos.z];
const shown = (selector: string): boolean => !document.querySelector(selector)?.classList.contains('hidden');

/** Every object the one the hero is near where he stands to use it (the first moved off its stand, with `canary`). */
async function objectsUsable(lab: Lab, canary: boolean): Promise<Checked> {
  const missed: string[] = [];
  let caught: boolean | null = null;
  for (const [i, o] of VILLAGE_OBJECTS.entries()) {
    const planted = canary && i === 0;
    await stand(lab, planted ? [o.stand[0] + STAND_OFF, o.stand[1]] : o.stand);
    const near = objectNear()?.id ?? 'nothing';
    const found = near === o.id;
    if (planted) caught = !found;
    if (!found) missed.push(`${o.id}: from its stand${planted ? ' (moved off it)' : ''} the hero is near ${near}`);
  }
  const usable = VILLAGE_OBJECTS.length - missed.length;
  const line = `objects: ${usable} of ${VILLAGE_OBJECTS.length} usable from their stands`;
  return { lines: [line, ...missed], problems: missed, caught };
}

/** His skills armed in the yard's middle and not on the square (the yard read outside it, with `canary`). */
async function castingInYard(lab: Lab, canary: boolean): Promise<Checked> {
  const [yx, yz] = yardToWorld(0, 0);
  await stand(lab, canary ? [yx + OUT_OF_YARD, yz] : [yx, yz]);
  const inYard = G.player.armed;
  await stand(lab, [0, 4.5]);
  const onSquare = G.player.armed;
  const problems = [
    ...(inYard ? [] : ['casting: he can\'t cast in the yard']),
    ...(onSquare ? ['casting: he can cast on the square'] : []),
  ];
  const armed = (on: boolean): string => (on ? 'armed' : 'not armed');
  const line = `casting: in the yard ${armed(inYard)}, on the square ${armed(onSquare)}`;
  return { lines: [line], problems: canary ? [] : problems, caught: canary ? !inYard : null };
}

/** The walks out: from inside the palisade toward it all round, and along each way out and across it. */
function walksOut(): { from: Spot; toward: Spot; name: string }[] {
  const walks = palisadePolygon(WALKS).map(([x, z], k) => {
    const out = Math.hypot(x, z);
    const from: Spot = [x * WALK_IN, z * WALK_IN];
    const toward: Spot = [x / out * FAR, z / out * FAR];
    return { from, toward, name: `out ${k}` };
  });
  for (const id of BIOME_IDS) {
    const { gap, out } = ENTRANCES[id];
    const along = (d: number, across: number): Spot => [
      gap[0] + out[0] * d - out[1] * across,
      gap[1] + out[1] * d + out[0] * across,
    ];
    walks.push({ from: along(2, 0), toward: along(FAR, 0), name: `${id} way, out` });
    walks.push({ from: along(3, 0), toward: along(3, FAR), name: `${id} way, right` });
    walks.push({ from: along(3, 0), toward: along(3, -FAR), name: `${id} way, left` });
  }
  return walks;
}

/** No walk ends outside the palisade but in a way out (a hero put past it after the first walk, with `canary`). */
async function boundsClosed(lab: Lab, canary: boolean): Promise<Checked> {
  const leaks: string[] = [];
  let caught: boolean | null = null;
  for (const [i, walk] of walksOut().entries()) {
    await stand(lab, walk.from);
    await walkToward(lab, walk.toward);
    if (canary && i === 0) G.player.pos.set(G.player.pos.x * 2.2, 0, G.player.pos.z * 2.2);
    const [x, z] = at();
    const inside = insidePalisade(x, z) || inWay(x, z, 1);
    const planted = canary && i === 0;
    if (planted) caught = !inside;
    const put = planted ? ' (put there)' : '';
    if (!inside) leaks.push(`bounds: ${walk.name} ended outside${put}, at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  const line = `bounds: ${walksOut().length - leaks.length} of ${walksOut().length} walks out stopped inside`;
  return { lines: [line, ...leaks], problems: leaks, caught };
}

/** No walk along a way out gets past its portal, straight through it or round its sides (from play: "for village
 *  portals, I should not be able to walk past them"; a hero put past it after the first walk, with `canary`). */
async function portalsHold(lab: Lab, canary: boolean): Promise<Checked> {
  const passed: string[] = [];
  const problems: string[] = [];
  let walks = 0;
  let caught: boolean | null = null;
  for (const id of BIOME_IDS) {
    const { gap, out, portalOut } = ENTRANCES[id];
    const along = (d: number, across: number): Spot => [
      gap[0] + out[0] * d - out[1] * across,
      gap[1] + out[1] * d + out[0] * across,
    ];
    for (const across of PORTAL_ACROSS) {
      const planted = canary && walks === 0;
      walks++;
      await stand(lab, along(portalOut - PORTAL_BEFORE, across));
      await walkToward(lab, along(FAR, across));
      if (planted) putAt(along(portalOut + 1.5, across));
      const [x, z] = at();
      const outAlong = (x - gap[0]) * out[0] + (z - gap[1]) * out[1];
      const past = outAlong > portalOut;
      if (planted) caught = past;
      if (past) {
        const put = planted ? ' (put there)' : '';
        passed.push(`portals: the ${id} portal walked past ${across} m aside, to ${outAlong.toFixed(1)} m out${put}`);
        if (!planted) problems.push(passed[passed.length - 1]);
      }
    }
  }
  const line = `portals: ${walks - passed.length} of ${walks} walks at them stopped before them`;
  return { lines: [line, ...passed], problems, caught };
}

/** how far before and behind a cottage the hero is sent across it (m past its walls), and the frames he has to
 *  get there round it (a walk of 15 m or so at his pace takes about 200) */
const ROUND_OUT = 2.5;
const ROUND_FRAMES = 600;

/** Sent to a spot on the far side of each cottage from where he stands, as a place picked on the map sends him
 *  (`goTo`): there round it within `ROUND_FRAMES`, not stuck on its wall (walked straight, with `canary`, he must
 *  not get there; from play, "map waypoints dont work, when path is long and curved... it just runs into
 *  obstacles"). */
async function roundCottages(lab: Lab, canary: boolean): Promise<Checked> {
  const lines: string[] = [];
  const problems: string[] = [];
  let caught: boolean | null = null;
  let arrived = 0;
  for (const [k, c] of COTTAGES.entries()) {
    const out = (COTTAGE.d / 2) * c.size + ROUND_OUT;
    const ax = Math.sin(c.facing), az = Math.cos(c.facing);
    const from: Spot = [c.x + ax * out, c.z + az * out], to: Spot = [c.x - ax * out, c.z - az * out];
    const planted = canary && k === 0;
    routing.on = !planted;
    try {
      await stand(lab, from);
      goTo(to[0], to[1]);
      await lab.step(ROUND_FRAMES);
    } finally {
      routing.on = true;
      G.player.walkTo = null;
    }
    const [x, z] = at();
    const off = Math.hypot(x - to[0], z - to[1]);
    const there = off < 1;
    if (planted) {
      caught = !there;
      continue;
    }
    if (there) arrived++;
    else problems.push(`route: sent round cottage ${k + 1}, he stopped ${off.toFixed(1)} m short of the spot`);
  }
  const counted = COTTAGES.length - (canary ? 1 : 0);
  lines.push(`route: ${arrived} of ${counted} walks round a cottage got there`, ...problems);
  return { lines, problems, caught };
}

/** the frames a walk across the village has to get there (from a portal to the hall of heroes, up its stair and in,
 *  is 50 m or so: about 700 frames), stepped a chunk at a time and stopped once he's there */
const ACROSS_FRAMES = 1500;
const ACROSS_CHUNK = 30;

/** The hero stepped until he stands within a metre of `to` or `ACROSS_FRAMES` have gone: how far off he ended. */
async function walkedTo(lab: Lab, to: Spot): Promise<number> {
  const off = (): number => Math.hypot(G.player.pos.x - to[0], G.player.pos.z - to[1]);
  for (let f = 0; f < ACROSS_FRAMES && off() >= 1; f += ACROSS_CHUNK) await lab.step(ACROSS_CHUNK);
  return off();
}

/** Sent from each portal to each of the other objects' stands, as a place picked on the map sends him (`goTo`): there
 *  within `ACROSS_FRAMES` (walked straight, with `canary`, the first walk must not get there; from play, "I tried
 *  from portal to hall of heroes, he ran into the house and stopped"). */
async function walksAcross(lab: Lab, canary: boolean): Promise<Checked> {
  const problems: string[] = [];
  let caught: boolean | null = null;
  let arrived = 0;
  let counted = 0;
  const portals = VILLAGE_OBJECTS.filter((o) => o.use === 'portal');
  const others = VILLAGE_OBJECTS.filter((o) => o.use !== 'portal');
  for (const p of portals) {
    for (const o of others) {
      const planted = canary && caught === null;
      routing.on = !planted;
      let off: number;
      try {
        await stand(lab, p.stand);
        goTo(o.stand[0], o.stand[1]);
        off = await walkedTo(lab, o.stand);
      } finally {
        routing.on = true;
        G.player.walkTo = null;
      }
      if (planted) {
        caught = off >= 1;
        continue;
      }
      counted++;
      if (off < 1) arrived++;
      else problems.push(`route: from the ${p.id} portal to the ${o.id}, he stopped ${off.toFixed(1)} m short`);
    }
  }
  return { lines: [`route: ${arrived} of ${counted} walks from a portal to an object got there`, ...problems], problems,
    caught };
}

/** The hero moved to (x, z) at once, as a fault planted there. */
function putAt([x, z]: Spot): void {
  G.player.pos.set(x, 0, z);
}

/** Up the terrace's stair to the hall's plinths: on the terrace's top by its end (beside it, into the wall, with
 *  `canary`: he must not get up). */
async function stairClimbed(lab: Lab, canary: boolean): Promise<Checked> {
  const across = canary ? TERRACE.stairHalf + 2 : 0;
  await stand(lab, [TERRACE.x + across, TERRACE.stairFoot + 1.5], Math.PI);
  await walkToward(lab, [TERRACE.x + across, HALL.door + 1.2]);
  // (the body's height over the ground he stands on: his position is on the floor's plane)
  const up = G.player.obj.position.y > TERRACE.high - 0.15;
  const { x, z } = G.player.pos, y = G.player.obj.position.y;
  const ended = `at ${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(1)}`;
  const line = `stair: ${up ? 'up' : 'not up'} on the terrace (${ended}; its top ${TERRACE.high} m up)`;
  const problems = up || canary ? [] : ['stair: the hero never got up onto the terrace'];
  return { lines: [line], problems, caught: canary ? !up : null };
}

/** V pressed for a frame (held, every frame would be a press), the view let settle. */
async function pressV(lab: Lab): Promise<void> {
  await lab.step(1, () => ({ keys: ['v'] }));
  await lab.step(SETTLE);
}

/** In the close view, the pointer let go once the hall of heroes is used (asked of the square instead, with
 *  `canary`, where mouse look holds it). */
async function hallFreesPointer(lab: Lab, canary: boolean): Promise<Checked> {
  await stand(lab, [0, 4.5]);
  await pressV(lab);
  await lab.step(SETTLE);
  if (renderer.viewMode() === 'top') throw new Error('lab: V never took the village into a close view');
  const lookHeld = pointerWanted();
  if (!canary) {
    await stand(lab, villageObject('hall')!.stand);
    goUse(villageObject('hall')!);
    await lab.until(heroSelectOpen, 600, 'the hall never opened the hero selection screen');
    await lab.step(SETTLE);
  }
  const held = pointerWanted();
  const line = `pointer: mouse look ${lookHeld ? 'holds' : 'lets go of'} it on the square, `
    + `${held ? 'holds' : 'lets go of'} it ${canary ? 'there (asked there)' : 'over the hall\'s screen'}`;
  const problems = !lookHeld ? ['pointer: the close view never asked for mouse look on the square'] : [];
  if (!canary && held) problems.push('pointer: the hall of heroes\' screen kept the pointer locked (hidden)');
  if (heroSelectOpen()) closeHeroSelect();
  await pressV(lab);
  await pressV(lab);
  await lab.step(SETTLE);
  return { lines: [line], problems: canary ? [] : problems, caught: canary ? held : null };
}

/** frames the view is tilted up through the eyes, then down, and how far a frame (px of mouse look) */
const TILT_UP = 30;
const TILT_DOWN = 150;
const TILT_PX = 4;
/** how much of its sight's steepness the tilt must sweep through (the sine of its pitch: from level down) */
const TILT_SWEPT = 0.3;
/** the most the grass's rings' middle may move in a frame as the view tilts (m: it follows the sight 0.6 m a frame
 *  at this tilt; the jump it's for was 22) */
const FOCUS_STEP = 2;
/** how far a canary moves the rings' middle in a frame (m) */
const FOCUS_JUMP = 20;

/** Through the eyes, the view tilted from over level down toward the ground: the grass's rings' middle (`focusOf`)
 *  moves a little a frame (from play, "grass a near circle that keeps updating in front of me": a sight crossing
 *  just under level threw it from 2 m to 24 m before him; moved 20 m in a frame, with `canary`). */
async function grassSteady(lab: Lab, canary: boolean): Promise<Checked> {
  await stand(lab, [0, 4.5]);
  await pressV(lab);
  await pressV(lab);
  if (renderer.viewMode() !== 'first') throw new Error('lab: V never took the village through the eyes');
  const at = new THREE.Vector2(), last = new THREE.Vector2(), sight = new THREE.Vector3();
  let most = 0, steepest = 0, highest = -1, frames = 0;
  const tilt = (frame: number) => ({ look: [0, frame < TILT_UP ? -TILT_PX : TILT_PX] as [number, number] });
  await lab.step(TILT_UP + TILT_DOWN, tilt, (frame) => {
    focusOf(G.camera, at);
    if (canary && frame === TILT_UP + TILT_DOWN / 2) at.x += FOCUS_JUMP;
    if (frames++) most = Math.max(most, at.distanceTo(last));
    last.copy(at);
    const down = -G.camera.getWorldDirection(sight).y;
    steepest = Math.max(steepest, down);
    highest = Math.max(highest, -down);
  });
  if (highest < 0 || steepest < TILT_SWEPT) throw new Error('lab: the view never tilted from over level down');
  await pressV(lab);
  const line = `grass: the rings' middle moved at most ${most.toFixed(2)} m a frame as the view tilted through the eyes`
    + (canary ? ' (one moved there)' : '');
  const problems = most > FOCUS_STEP ? [`grass: the rings' middle jumped ${most.toFixed(1)} m in a frame`] : [];
  return { lines: [line], problems: canary ? [] : problems, caught: canary ? most > FOCUS_STEP : null };
}

/** The portal's card as it stands: its way in shown, or the training's warning in its place. */
async function portalCard(lab: Lab): Promise<{ enter: boolean; warned: boolean }> {
  const portal = villageObject('crypt')!;
  await stand(lab, portal.stand);
  goUse(portal);
  await lab.step(SETTLE);
  const card = { enter: shown('#btn-start'), warned: shown('#vcard .vc-training') };
  (document.querySelector('#vcard .vc-close') as HTMLElement | null)?.click();
  await lab.step(SETTLE);
  return card;
}

/** An object used where the hero stands for it, then walked off from (what it opened put away). */
async function use(lab: Lab, o: VillageObject): Promise<void> {
  await stand(lab, o.stand);
  goUse(o);
  await lab.step(SETTLE);
  await stand(lab, [0, 4.5]);
}

/** The training's steps taken as a player takes them (the notice board left out, with `canary`): each ticked, the
 *  portal holding its way in until all are done; then begun again and skipped, the portal open at once. */
async function training(lab: Lab, canary: boolean): Promise<Checked> {
  restartTraining();
  const problems: string[] = [];
  const before = await portalCard(lab);
  if (before.enter || !before.warned) problems.push('training: the portal let him in with the training under way');
  await stand(lab, yardToWorld(0, 0));
  const [dx, dz] = YARD_DUMMIES[1];
  const dummy = new THREE.Vector3(dx, 1, dz);
  await stand(lab, [dx, dz - 3]);
  // (held, then let go: the ranger's bow looses only as it's let go, and held throughout it struck nothing)
  await lab.step(STRIKE_HELD, () => ({ m0: true, aim: dummy }));
  await lab.step(STRIKE_AFTER, () => ({ aim: dummy }));
  await lab.step(1, () => ({ keys: ['m'] }));
  await lab.step(SETTLE);
  const mapped = villageMapOpen();
  await lab.step(1, () => ({ keys: ['m'] }));
  await lab.step(60);
  await use(lab, villageObject('chest')!);
  if (!canary) await use(lab, villageObject('notice')!);
  const left = TRAINING.filter((t) => !stepDone(t.id)).map((t) => t.id);
  if (!mapped) problems.push('training: M never opened the map');
  if (!canary && left.length) problems.push(`training: steps taken but not ticked: ${left.join(', ')}`);
  const after = await portalCard(lab);
  if (!canary && (!after.enter || after.warned)) problems.push('training: the portal stayed shut after the training');
  restartTraining();
  skipTraining();
  const skipped = await portalCard(lab);
  if (trainingPending() || !skipped.enter) problems.push('training: skipped, the portal stayed shut');
  const lines = [
    `training: under way, the portal ${before.enter ? 'open' : 'shut'}${before.warned ? ', warned' : ''}; `
      + `steps left after taking them: ${left.length ? left.join(', ') : 'none'}; `
      + `then ${after.enter ? 'open' : 'shut'}; skipped, ${skipped.enter ? 'open' : 'shut'}`,
  ];
  return { lines, problems: canary ? [] : problems, caught: canary ? left.includes('notice') && !after.enter : null };
}

/** Each hour of the day drawn: no program compiled for any (a new material shown at noon, with `canary`). */
async function hoursCompileNothing(lab: Lab, canary: boolean): Promise<Checked> {
  await stand(lab, [0, 4.5]);
  holdHour(HOURS[0]);
  lab.capture(['lobby']);
  const programs = (): number => G.renderer.info.programs?.length ?? 0;
  const first = programs();
  let planted: THREE.Mesh | null = null;
  for (const hour of HOURS) {
    holdHour(hour);
    if (canary && hour === 12) {
      const unseen = new THREE.MeshPhysicalMaterial({ sheen: 1, iridescence: 1 });
      planted = new THREE.Mesh(new THREE.SphereGeometry(0.5), unseen);
      planted.position.set(0, 1.5, 3);
      G.scene.add(planted);
    }
    await lab.step(2);
    lab.capture(['lobby']);
  }
  holdHour(null);
  if (planted) G.scene.remove(planted);
  const made = programs() - first;
  const line = `hours: ${HOURS.join(', ')} drawn, ${made} program${made === 1 ? '' : 's'} compiled`;
  const problems = made && !canary ? [`hours: ${made} programs compiled as the hour changed`] : [];
  return { lines: [line], problems, caught: canary ? made > 0 : null };
}
