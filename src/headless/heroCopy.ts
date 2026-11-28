// A hero as the server holds one: a partner's copy, as a host's game holds a guest's. Each game moves and judges its own
// hero (net/AGENTS.md), so what the fight would do to a hero's life or body here is his own game's to do: the copy
// takes it and leaves it, and his place, his state and his fall come from his game's reports. Only what the fight's
// modules read or call of a hero (the run's start and end, a foe's blow and hold, a boss's seize).
import * as THREE from 'three';
import type { Player } from '../entities/player';

/** A partner's copy, placed by his game's reports (`local` false). */
export class HeroCopy {
  readonly local = false;
  active = true;
  alive = true;
  inRun = true;
  downed = false;
  flying = false;
  readonly radius = 0.45;
  readonly obj = new THREE.Group();
  readonly pos = this.obj.position;
  readonly vel = new THREE.Vector3();
  dash = null;
  readonly remote = { sit: null };
  /** (his game's: told by its reports, read here only as the run heals the party between waves) */
  readonly stats = { maxLife: 1, armor: 0, resist: 0 };

  constructor(readonly slot: number, x: number, z: number) {
    this.obj.position.set(x, 0, z);
  }

  /** (his game's: his life, his stats, his fall and his rise, a blow or a hold on him) */
  reset(): void {}
  recomputeStats(): void {}
  takeDamage(): null { return null; }
  heal(): void {}
  goDown(): void {}
  standDown(): void {}
  stopChannel(): void {}
  root(): boolean { return false; }

  /** The copy as the fight's modules take a hero. */
  asPlayer(): Player { return this as unknown as Player; }
}
