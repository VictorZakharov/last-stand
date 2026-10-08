// The lab's co-op judged (tools/lab `coop`): what each of the two games showed, frame by frame (page/coop.ts
// `Sample`), against what the other one had in the same frame. A hero or a foe copied from the other game is judged by
// how far behind it is (the delay that lines its path up best with its own game's), how far off that path it is, and
// how roughly it moves (its speed against its own, a frame at a time, and its largest move a frame); an arrow that
// struck a foe on the guest's screen by whether the host counted it, and how long its blow took to show on the foe; a
// blow at the guest by whether it hurt it, against whether the guest was where it landed on its own screen.

/** the longest delay looked for, frames (a second and a quarter) */
const MOST_DELAY = 75;
/** a source moving less than this over a scenario is standing: it has no delay to find, m */
const STILL_PATH = 0.3;
/** a life falling by less than this in a frame is no hit (a hero's regeneration rounds it up and down) */
const LIFE_DROP = 0.5;
/** how long before and after an arrow struck on the guest's screen the host may count it, frames */
const SHOT_BEFORE = 6;
const SHOT_AFTER = 90;
/** how long before and after a blow on the guest's screen it may hurt the guest, frames */
const BLOW_BEFORE = 30;
const BLOW_AFTER = 60;
/** a copy moving this much further a frame than its source ever does has jumped, m */
const JUMP_SLACK = 0.08;

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The median of `values` (none: NaN). */
export function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pathLength(points) {
  let length = 0;
  for (let f = 1; f < points.length; f++) {
    if (points[f] && points[f - 1]) length += distance(points[f], points[f - 1]);
  }
  return length;
}

function largestMove(points) {
  let largest = 0;
  for (let f = 1; f < points.length; f++) {
    if (points[f] && points[f - 1]) largest = Math.max(largest, distance(points[f], points[f - 1]));
  }
  return largest;
}

/** How far `shown` is from `source` on average, `source` taken `delay` frames earlier (none to compare: Infinity). */
function offAt(shown, source, delay) {
  let total = 0;
  let count = 0;
  for (let f = delay; f < shown.length; f++) {
    if (!shown[f] || !source[f - delay]) continue;
    total += distance(shown[f], source[f - delay]);
    count++;
  }
  return count ? total / count : Infinity;
}

/** The rms of the difference between `shown`'s move a frame and `source`'s, `delay` frames earlier, m a frame. */
function roughAt(shown, source, delay) {
  let total = 0;
  let count = 0;
  for (let f = delay + 1; f < shown.length; f++) {
    const points = [shown[f], shown[f - 1], source[f - delay], source[f - delay - 1]];
    if (points.some((point) => !point)) continue;
    const dx = shown[f][0] - shown[f - 1][0] - (source[f - delay][0] - source[f - delay - 1][0]);
    const dz = shown[f][1] - shown[f - 1][1] - (source[f - delay][1] - source[f - delay - 1][1]);
    total += dx * dx + dz * dz;
    count++;
  }
  return count ? Math.sqrt(total / count) : 0;
}

/**
 * How a copy (`shown`, a point or null a frame) follows its source (`source`, the same frames in the game it comes
 * from): its delay (the one that lines the two paths up best, frames), how far off the path it is then (m), how
 * roughly it moves (the rms of its move a frame against its source's then, m a frame), and its largest move a frame
 * against its source's (m). A source that stands has no delay (`still`).
 */
export function follow(shown, source) {
  const jump = largestMove(shown);
  const sourceJump = largestMove(source);
  if (pathLength(source) < STILL_PATH) return { still: true, jump, sourceJump, off: offAt(shown, source, 0) };
  let delay = 0;
  let off = Infinity;
  for (let candidate = 0; candidate <= MOST_DELAY; candidate++) {
    const candidateOff = offAt(shown, source, candidate);
    if (candidateOff < off) {
      off = candidateOff;
      delay = candidate;
    }
  }
  return { still: false, delay, off, rough: roughAt(shown, source, delay), jump, sourceJump };
}

/** The frames in which `lives` (one a frame) falls, each with how much. */
export function drops(lives) {
  const found = [];
  for (let f = 1; f < lives.length; f++) {
    if (lives[f] === undefined || lives[f - 1] === undefined) continue;
    if (lives[f] < lives[f - 1] - LIFE_DROP) found.push({ frame: f, amount: lives[f - 1] - lives[f] });
  }
  return found;
}

/** The first of `events` (by frame) not yet `used`, within [from, to]; marks it used. */
function takeWithin(events, used, from, to) {
  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    if (events[i].frame < from || events[i].frame > to) continue;
    used.add(i);
    return events[i];
  }
  return null;
}

/** One foe's position a frame (null where a game didn't show it) in `samples`. */
function foePath(samples, id) {
  return samples.map((sample) => {
    const foe = sample.foes.find((candidate) => candidate.id === id);
    return foe ? [foe.x, foe.z] : null;
  });
}

function foeLives(samples, id) {
  return samples.map((sample) => sample.foes.find((candidate) => candidate.id === id)?.life);
}

function foeIds(samples) {
  const ids = new Set();
  for (const sample of samples) for (const foe of sample.foes) ids.add(foe.id);
  return [...ids].sort((a, b) => a - b);
}

/**
 * The guest's arrows: each one that struck a foe on its screen, whether the host counted it (the foe's life falling
 * there within a moment of it) and how long the foe's life on the guest's screen took to fall after it (frames);
 * and the host's counts that no arrow on the guest's screen struck.
 */
export function judgeShots(host, guest) {
  const struck = [];
  guest.forEach((sample, frame) => {
    for (const id of sample.struck) struck.push({ frame, id });
  });
  const loosed = guest.reduce((total, sample) => total + sample.loosed, 0);
  const hostDrops = new Map();
  const guestDrops = new Map();
  const hostUsed = new Map();
  const guestUsed = new Map();
  for (const id of foeIds(host)) {
    hostDrops.set(id, drops(foeLives(host, id)));
    guestDrops.set(id, drops(foeLives(guest, id)));
    hostUsed.set(id, new Set());
    guestUsed.set(id, new Set());
  }
  let counted = 0;
  const shownAfter = [];
  for (const shot of struck) {
    const counts = hostDrops.get(shot.id) ?? [];
    const countUsed = hostUsed.get(shot.id) ?? new Set();
    const found = takeWithin(counts, countUsed, shot.frame - SHOT_BEFORE, shot.frame + SHOT_AFTER);
    if (found) counted++;
    const shown = guestDrops.get(shot.id) ?? [];
    const fell = takeWithin(shown, guestUsed.get(shot.id) ?? new Set(), shot.frame, shot.frame + SHOT_AFTER);
    if (fell) shownAfter.push(fell.frame - shot.frame);
  }
  let unseen = 0;
  for (const [id, counts] of hostDrops) unseen += counts.length - hostUsed.get(id).size;
  return { loosed, struck: struck.length, counted, unseen, shownAfter };
}

/**
 * The blows at the guest as its screen shows them: each one where the guest was in its reach or not as it landed,
 * and whether it hurt the guest (its life falling within a moment of it), how long after (frames); and the hurts no
 * blow it saw explains.
 */
export function judgeBlows(guest) {
  const blows = [];
  guest.forEach((sample, frame) => {
    for (const foe of sample.foes) if (foe.blow) blows.push({ frame, inReach: foe.inReach });
  });
  const hurts = drops(guest.map((sample) => sample.life));
  const used = new Set();
  const tally = { blows: blows.length, inReach: 0, inReachHurt: 0, dodged: 0, dodgedHurt: 0, hurtAfter: [] };
  for (const blow of blows) {
    const hurt = takeWithin(hurts, used, blow.frame - BLOW_BEFORE, blow.frame + BLOW_AFTER);
    if (blow.inReach) tally.inReach++;
    else tally.dodged++;
    if (hurt && blow.inReach) tally.inReachHurt++;
    if (hurt && !blow.inReach) tally.dodgedHurt++;
    if (hurt) tally.hurtAfter.push(hurt.frame - blow.frame);
  }
  tally.unexplained = hurts.length - used.size;
  return tally;
}

const ms = (frames, frameMs) => `${Math.round(frames * frameMs)} ms`;
const cm = (metres) => `${Math.round(metres * 100)} cm`;

/** A copy's following as a line, and the problem it has (a jump), if any. */
function describeFollow(what, followed, frameMs) {
  if (!followed) return { line: `${what}: never shown`, problem: `${what} was never shown` };
  const moves = `the largest move a frame ${cm(followed.jump)} (its own ${cm(followed.sourceJump)})`;
  const jumped = followed.jump > followed.sourceJump + JUMP_SLACK;
  const problem = jumped ? `${what} jumped ${cm(followed.jump)} in a frame` : null;
  if (followed.still) return { line: `${what}: standing, ${cm(followed.off)} off, ${moves}`, problem };
  const speed = `${(followed.rough / (frameMs / 1000)).toFixed(2)} m/s`;
  const line = `${what}: ${ms(followed.delay, frameMs)} behind, ${cm(followed.off)} off its path, its speed off its ` +
    `own by ${speed} (rms), ${moves}`;
  return { line, problem };
}

/** How a game played its partner's reports out (where its tree says): how far behind the freshest, how often a stall
 *  held it at the newest, how far its clock's rate strayed from ours. */
export function describePlayout(what, samples) {
  const frames = samples.map((sample) => sample.playout).filter(Boolean);
  if (!frames.length) return null;
  const behind = median(frames.map((frame) => frame.behind));
  const held = frames.filter((frame) => frame.held).length / frames.length;
  const strayed = Math.sqrt(frames.reduce((total, frame) => total + (frame.rate - 1) ** 2, 0) / frames.length);
  return `${what}: ${Math.round(behind)} ms behind the freshest report (median), held at the newest by a stall ` +
    `${(held * 100).toFixed(1)}% of frames, its rate off ours by ${(strayed * 100).toFixed(1)}% (rms)`;
}

/** The foes on the guest's screen against the host's, put together. */
function describeFoes(host, guest, frameMs) {
  const followed = foeIds(host).map((id) => follow(foePath(guest, id), foePath(host, id)));
  const moving = followed.filter((one) => !one.still);
  if (!moving.length) return { line: 'the foes on the guest\'s screen: none moved', problem: null };
  const delays = moving.map((one) => one.delay);
  const jump = Math.max(...followed.map((one) => one.jump));
  const sourceJump = Math.max(...followed.map((one) => one.sourceJump));
  const rough = Math.sqrt(moving.reduce((total, one) => total + one.rough ** 2, 0) / moving.length);
  const speed = `${(rough / (frameMs / 1000)).toFixed(2)} m/s`;
  const line = `the ${followed.length} foes on the guest's screen: ${ms(median(delays), frameMs)} behind (the most ` +
    `${ms(Math.max(...delays), frameMs)}), ${cm(median(moving.map((one) => one.off)))} off their paths, their speed ` +
    `off their own by ${speed} (rms), the largest move a frame ${cm(jump)} (their own ${cm(sourceJump)})`;
  const problem = jump > sourceJump + JUMP_SLACK ? `a foe on the guest's screen jumped ${cm(jump)} in a frame` : null;
  return { line, problem };
}

function describeShots(host, guest, frameMs) {
  const shots = judgeShots(host, guest);
  const lost = shots.struck - shots.counted;
  const shown = shots.shownAfter.length
    ? `; the foe's life fell on the guest's screen ${ms(median(shots.shownAfter), frameMs)} after it was struck ` +
      `(median, the most ${ms(Math.max(...shots.shownAfter), frameMs)})`
    : '';
  const line = `arrows: ${shots.loosed} loosed, ${shots.struck} struck the foe on the guest's screen, ` +
    `${shots.counted} of them counted on the host (${lost} lost), ${shots.unseen} counted that struck nothing on ` +
    `its screen${shown}`;
  const problems = [];
  if (lost) problems.push(`${lost} arrows that struck the foe on the guest's screen never counted`);
  if (shots.unseen) {
    problems.push(`${shots.unseen} arrows counted on the host that struck nothing on the guest's screen`);
  }
  return { line, problems };
}

function describeBlows(guest, frameMs) {
  const blows = judgeBlows(guest);
  const after = blows.hurtAfter.length
    ? `; a hurt showed ${ms(median(blows.hurtAfter), frameMs)} after its blow on the guest's screen (median)`
    : '';
  const line = `blows at the guest on its screen: ${blows.blows}: in its reach ${blows.inReach} (hurt ` +
    `${blows.inReachHurt}), dodged ${blows.dodged} (hurt ${blows.dodgedHurt}); hurt by no blow it saw ` +
    `${blows.unexplained}${after}`;
  const problems = [];
  if (blows.dodgedHurt) problems.push(`${blows.dodgedHurt} blows the guest dodged on its screen hurt it`);
  if (blows.inReach > blows.inReachHurt) {
    problems.push(`${blows.inReach - blows.inReachHurt} blows that landed on the guest on its screen never hurt it`);
  }
  if (blows.unexplained) problems.push(`${blows.unexplained} hurts on the guest came from no blow on its screen`);
  return { line, problems };
}

/** The first frame from `from` on in which `has(sample)` holds (none: -1). */
function firstWhere(samples, has, from = 0) {
  for (let f = from; f < samples.length; f++) if (has(samples[f])) return f;
  return -1;
}

/**
 * A guest brought down and raised: when it went down on its own screen and on the host's, when the host raised it
 * and when its own screen showed it, frames (-1: never).
 */
export function judgeDown(host, guest) {
  const downHere = firstWhere(guest, (sample) => sample.standing.self === 'down');
  const downThere = firstWhere(host, (sample) => sample.standing.partner === 'down');
  const raisedThere = downThere < 0 ? -1 : firstWhere(host, (sample) => sample.standing.partner === 'up', downThere);
  const raisedHere = downHere < 0 ? -1 : firstWhere(guest, (sample) => sample.standing.self === 'up', downHere);
  return { downHere, downThere, raisedThere, raisedHere };
}

function describeDown(host, guest, frameMs) {
  const down = judgeDown(host, guest);
  const at = (frame) => (frame < 0 ? 'never' : `at ${((frame * frameMs) / 1000).toFixed(2)} s`);
  const line = `the guest went down ${at(down.downHere)} on its screen and ${at(down.downThere)} on the host's; ` +
    `the host raised it ${at(down.raisedThere)}, and its own screen showed it ${at(down.raisedHere)}`;
  const problems = [];
  if (down.downHere < 0 || down.downThere < 0) problems.push('the guest never went down on both screens');
  if (down.raisedThere < 0 || down.raisedHere < 0) problems.push('the guest was never raised on both screens');
  return { line, problems };
}

/**
 * A scenario judged: its lines (each copy's following, the arrows, the blows, as the scenario has them) and the
 * problems found. `host` and `guest` are the two games' samples, frame for frame.
 */
export function judgeScenario({ name, about, host, guest, frameMs }) {
  const lines = [`${name} (${about})`];
  const problems = [];
  const add = ({ line, problem, problems: more }) => {
    lines.push(`  ${line}`);
    if (problem) problems.push(`${name}: ${problem}`);
    for (const one of more ?? []) problems.push(`${name}: ${one}`);
  };
  const guestOnHost = follow(host.map((sample) => sample.partner), guest.map((sample) => sample.self));
  add(describeFollow('the guest\'s hero on the host\'s screen', guestOnHost, frameMs));
  const hostOnGuest = follow(guest.map((sample) => sample.partner), host.map((sample) => sample.self));
  add(describeFollow('the host\'s hero on the guest\'s screen', hostOnGuest, frameMs));
  for (const [what, samples] of [["the host's play-out", host], ["the guest's play-out", guest]]) {
    const line = describePlayout(what, samples);
    if (line) lines.push(`  ${line}`);
  }
  if (foeIds(host).length) add(describeFoes(host, guest, frameMs));
  if (name === 'shoot') add(describeShots(host, guest, frameMs));
  if (name === 'dodge') add(describeBlows(guest, frameMs));
  if (name === 'down') add(describeDown(host, guest, frameMs));
  return { lines, problems };
}
