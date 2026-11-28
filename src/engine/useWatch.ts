// Which of the materials or geometries in use the frame looks at (#973): those that changed, not every one. Each
// notes itself as its version moves (`takeChanged`, the API's), and so do its parts (a material's textures, a
// geometry's attributes), which can be shared: a part that changed has its owners looked at. What follows something
// that moves no version (a look's numbers follow the game's own uniforms) is polled, looked at every frame. Asking
// every material and geometry in use every frame (every biome's, all in the world from the boot) was a fifth of a
// slowed CPU's frame at wave 36 (`lab perf --wave 36 --throttle 4 --profile=frame`), where three's walk asked only
// what it drew.
//
// What a note could miss (a field the game sets that moves no version) is found within `SWEEP_FRAMES` frames all the
// same: a share of everything in use is looked at each frame, so no frame pays for them all at once.
import { TUNE } from './globals';

/** the frames everything in use is looked at over, whatever changed */
const SWEEP_FRAMES = 30;

/** What a watch needs to know of what it watches. */
export interface WatchRules<Owner, Part> {
  /** whether it's looked at every frame, whatever changed */
  polled: (owner: Owner) => boolean;
  /** its parts, whose changes make it looked at */
  partsOf: (owner: Owner) => Part[];
}

export class UseWatch<Owner extends object, Part extends object> {
  /** what's in use */
  private readonly inUse = new Set<Owner>();
  /** what of it is looked at every frame */
  private readonly polled = new Set<Owner>();
  /** each part's owners in use, and each owner's parts as it was last tracked */
  private readonly owners = new Map<Part, Set<Owner>>();
  private readonly parts = new Map<Owner, Part[]>();
  /** what's in use as a list, and how far this round of the sweep has reached in it */
  private sweep: Owner[] = [];
  private sweepAt = 0;
  /** everything looked at on the next frame (the engine's own were forgotten) */
  private all = true;
  private readonly visiting = new Set<Owner>();

  constructor(private readonly rules: WatchRules<Owner, Part>) {}

  /** `owner` in use from now on. */
  add(owner: Owner): void {
    if (this.inUse.has(owner)) return;
    this.inUse.add(owner);
    this.track(owner);
  }

  /** `owner` no longer in use. */
  drop(owner: Owner): void {
    if (!this.inUse.delete(owner)) return;
    this.polled.delete(owner);
    this.untrack(owner);
  }

  /** Whether `owner` is looked at every frame (`WatchRules.polled`). */
  isPolled(owner: Owner): boolean {
    return this.polled.has(owner);
  }

  /** Everything looked at on the next frame. */
  lookAtAll(): void {
    this.all = true;
  }

  /** What the frame looks at, given what `changed` since the last: what changed, what's polled, and the sweep's
   *  share. Read it before the next call, which empties it. */
  toVisit(changed: ReadonlySet<object>): ReadonlySet<Owner> {
    const visiting = this.visiting;
    visiting.clear();
    if (this.all || !TUNE.still) {
      this.all = false;
      for (const owner of this.inUse) visiting.add(owner);
      return visiting;
    }
    for (const owner of this.polled) visiting.add(owner);
    for (const what of changed) this.changed(what, visiting);
    this.sweepShare(visiting);
    return visiting;
  }

  /** What `what`'s change makes the frame look at: an owner in use (tracked again: its parts may have changed), or
   *  a part's owners. */
  private changed(what: object, visiting: Set<Owner>): void {
    const owner = what as Owner;
    if (this.inUse.has(owner)) {
      this.track(owner);
      visiting.add(owner);
    }
    const owners = this.owners.get(what as Part);
    if (owners) for (const user of owners) visiting.add(user);
  }

  /** The next share of everything in use added to `into`, a round of it every `SWEEP_FRAMES` frames. */
  private sweepShare(into: Set<Owner>): void {
    if (this.sweepAt >= this.sweep.length) {
      this.sweep = [...this.inUse];
      this.sweepAt = 0;
    }
    const end = Math.min(this.sweep.length, this.sweepAt + Math.ceil(this.sweep.length / SWEEP_FRAMES));
    for (; this.sweepAt < end; this.sweepAt++) {
      const owner = this.sweep[this.sweepAt];
      if (this.inUse.has(owner)) into.add(owner);
    }
  }

  /** `owner`'s parts and whether it's polled, as it stands now. */
  private track(owner: Owner): void {
    if (this.rules.polled(owner)) this.polled.add(owner);
    else this.polled.delete(owner);
    this.untrack(owner);
    const parts = this.rules.partsOf(owner);
    this.parts.set(owner, parts);
    for (const part of parts) {
      let owners = this.owners.get(part);
      if (!owners) this.owners.set(part, owners = new Set());
      owners.add(owner);
    }
  }

  /** `owner` off its parts' lists. */
  private untrack(owner: Owner): void {
    for (const part of this.parts.get(owner) ?? []) {
      const owners = this.owners.get(part);
      if (!owners) continue;
      owners.delete(owner);
      if (!owners.size) this.owners.delete(part);
    }
    this.parts.delete(owner);
  }
}
