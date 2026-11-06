// A sit's jerks (tools/lab `sit`): a hand, an elbow or what he holds changing its speed at once, as a move starts or
// stops dead or turns back in a frame. From play, of the warrior's sit by a fire: "campfire is jerky and lame, needs
// work", while his sit on a log or a stone was fine. The jump check (`sitCarried.ts`) reads a piece thrown 12 cm or
// turned 25 degrees in a frame, which a move eased in and out never comes near; this reads each point's change of
// move from one frame to the next (its acceleration over a frame squared), in the hero's own frame so his walk there
// and his turn to the seat don't count. Read only while a frame follows on from the one before: a gap (the sat idle
// left unread, a picture's set-up) starts each point afresh.

import * as THREE from 'three';
import type { Lab } from './lab';

/** a point's change of move from one frame to the next counted a jerk past this (m: 0.6 cm a frame squared is
 *  22 m/s², a hand stopped from 1 m/s in under 0.05 s) */
export const JERK_FROM = 0.006;
/** how many frames a sit may jerk on before it's a fault (a single frame is a float's or a stage's seam) */
const JERK_FRAMES_MOST = 2;
/** how many of the worst jerks are listed */
const LISTED = 12;

/** The points followed: a hand, an elbow and what he holds. */
type PointName = 'right hand' | 'left hand' | 'right elbow' | 'left elbow' | 'weapon\'s grip' | 'weapon\'s far end';

/** A point's places in the hero's frame over the last two frames, its worst jerk and where, and the frames it jerked. */
interface Followed {
  name: PointName;
  last: THREE.Vector3[];
  worst: number;
  worstAt: string;
  frames: number;
}

/** The change of move into a frame from the places over the last three frames (oldest first; m). */
export function jerkOf(places: readonly THREE.Vector3[]): number {
  if (places.length < 3) return 0;
  const [first, second, third] = places;
  return third.clone().sub(second).sub(second.clone().sub(first)).length();
}

/** The canary: a hand moving steadily doesn't jerk, eased to a stop doesn't, stopped dead from 2 cm a frame does. */
export function jerkCanary(): boolean {
  const at = (x: number) => new THREE.Vector3(x, 0, 0);
  const steady = jerkOf([at(0), at(0.02), at(0.04)]);
  const eased = jerkOf([at(0), at(0.004), at(0.006)]);
  const stopped = jerkOf([at(0), at(0.02), at(0.02)]);
  return steady < JERK_FROM && eased < JERK_FROM && stopped >= JERK_FROM;
}

const _at = new THREE.Vector3();

/** Each followed point's jerks over a sit. */
export class SitJerks {
  private readonly points: Followed[];
  private lastTime = -Infinity;
  /** the frames anything jerked, and the first */
  private frames = 0;
  private firstAt = '';
  /** every jerk, for the worst listed */
  private readonly jerks: { name: PointName; size: number; at: string }[] = [];

  constructor() {
    const names: PointName[] = [
      'right hand', 'left hand', 'right elbow', 'left elbow', 'weapon\'s grip', 'weapon\'s far end',
    ];
    this.points = names.map((name) => ({ name, last: [], worst: 0, worstAt: '', frames: 0 }));
  }

  /** Notes this frame's points, whatever part of the sit it's in (none while he walks there). */
  observe(lab: Lab, frame: string): void {
    const now = performance.now();
    const followsOn = now - this.lastTime < 1.5 * (1000 / 60);
    this.lastTime = now;
    const sitting = lab.player.sitting;
    if (!followsOn || !sitting.pose || sitting.walking) {
      for (const point of this.points) point.last = [];
      if (!sitting.pose || sitting.walking) this.lastTime = -Infinity;
      return;
    }
    lab.model.root.updateMatrixWorld(true);
    let jerked = false;
    for (const point of this.points) {
      const place = this.placeOf(lab, point.name);
      if (!place) {
        point.last = [];
        continue;
      }
      point.last.push(lab.model.root.worldToLocal(place).multiplyScalar(lab.model.root.scale.x));
      if (point.last.length > 3) point.last.shift();
      const jerk = jerkOf(point.last);
      if (jerk > point.worst) {
        point.worst = jerk;
        point.worstAt = frame;
      }
      if (jerk < JERK_FROM) continue;
      this.jerks.push({ name: point.name, size: jerk, at: frame });
      point.frames++;
      jerked = true;
    }
    if (!jerked) return;
    this.frames++;
    if (!this.firstAt) this.firstAt = frame;
  }

  /** A point's place in the world this frame, or none (no weapon held). */
  private placeOf(lab: Lab, name: PointName): THREE.Vector3 | null {
    const j = lab.joints;
    const tip = lab.model.tip;
    switch (name) {
      case 'right hand': return j.handR.getWorldPosition(new THREE.Vector3());
      case 'left hand': return j.handL.getWorldPosition(new THREE.Vector3());
      case 'right elbow': return j.elbowR.getWorldPosition(new THREE.Vector3());
      case 'left elbow': return j.elbowL.getWorldPosition(new THREE.Vector3());
      case 'weapon\'s grip': return tip?.parent ? tip.parent.getWorldPosition(new THREE.Vector3()) : null;
      case 'weapon\'s far end': return tip ? tip.getWorldPosition(_at).clone() : null;
    }
  }

  /** Each point's worst jerk as a line of text. */
  summary(name: string): string {
    const said = this.points
      .filter((point) => point.worst > 0)
      .map((point) => `${point.name} ${(point.worst * 100).toFixed(2)} (${point.frames})`)
      .join(', ');
    const worst = [...this.jerks]
      .sort((a, b) => b.size - a.size)
      .slice(0, LISTED)
      .map((jerk) => `      his ${jerk.name} ${(jerk.size * 100).toFixed(1)} cm (${jerk.at})`);
    const head = `    by the ${name}, the worst change of move in a frame, cm (frames over ${JERK_FROM * 100}): ${said}`;
    return [head, ...worst].join('\n');
  }

  /** The jerks as a fault, or none if it jerked on few enough frames. */
  describe(name: string): string {
    if (this.frames <= JERK_FRAMES_MOST) return '';
    const worst = this.points.reduce((a, b) => (b.worst > a.worst ? b : a));
    return `sit: by the ${name}, a hand, an elbow or the weapon jerked on ${this.frames} frames (from ${this.firstAt}; `
      + `the worst, his ${worst.name}, ${(worst.worst * 100).toFixed(1)} cm, ${worst.worstAt})`;
  }
}
