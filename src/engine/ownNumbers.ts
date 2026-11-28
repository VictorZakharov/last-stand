// What a record's shader reads of its one thing alone (Bulwark's plan.rs `OWN`, its nodes' own numbers): a kit's
// dissolve, frost, char, hit flash, its dissolve's edge and its highlights' most. A foe's every piece shares its
// kit, and a kind's every foe its materials: with these in the materials' numbers, each flash and fade described
// every one of the foe's materials again and drew the foe apart from its kind (wave 36 at a slowed CPU: a third of
// the render, `lab perf --wave 36 --throttle 4 --profile=render`). Now a kit's numbers are written once a frame
// on each node its records are drawn on, eight floats, and the materials stand still.
import type { KitLooks } from '../core/materials';
import type { AnyMaterial } from './materials';
import type { Core } from './core';
import { lookOf } from './custom';

/** where a record's own numbers begin, and how many (plan.rs `OWN`, `OWN_FLOATS`) */
export const OWN = 24;
export const OWN_FLOATS = 8;

/** A kit's own numbers, which its every material shows (`createKit` in core/materials.ts). */
export type KitNumbers = KitLooks['u'];

/** The kit `material` shows, if any. */
export function kitOf(material: AnyMaterial): KitNumbers | null {
  return (material as { kitLooks?: KitLooks }).kitLooks?.u ?? null;
}

/** `kit`'s own numbers written into `into` at `at`, as the kit look's shader reads them (`looks/kit.ts`). */
export function writeKit(kit: KitNumbers | null, into: Float32Array, at: number): void {
  if (!kit) {
    into.fill(0, at, at + OWN_FLOATS);
    return;
  }
  into[at] = kit.uDissolve.value;
  into[at + 1] = kit.uFrozen.value;
  into[at + 2] = kit.uChar.value;
  into[at + 3] = kit.uHit.value;
  const edge = kit.uEdge.value;
  into[at + 4] = edge.r;
  into[at + 5] = edge.g;
  into[at + 6] = edge.b;
  into[at + 7] = kit.uShine.value;
}

/** What writes a thing's own numbers at `at` of `into`: its kit's, or its look's (`RustLook.own`). */
export type OwnWriter = (into: Float32Array, at: number) => void;

/** each kit's writer, made once */
const kitWriters = new WeakMap<KitNumbers, OwnWriter>();

/** What writes `material`'s thing's own numbers: its kit's, or its look's; none where it has neither. */
export function ownWriterOf(material: AnyMaterial): OwnWriter | null {
  const kit = kitOf(material);
  if (kit) {
    let writer = kitWriters.get(kit);
    if (!writer) {
      writer = (into, at) => writeKit(kit, into, at);
      kitWriters.set(kit, writer);
    }
    return writer;
  }
  const look = lookOf(material);
  return look?.own ? (into, at) => look.own!(into, at) : null;
}

/** A node's writer, and how many meshes drawn on it hold it there. */
interface Held {
  writer: OwnWriter;
  holders: number;
}

/** The nodes whose records show a kit, each written with its kit's numbers once a frame. */
export class OwnNumbers {
  private byNode = new Map<number, Held>();
  private view = new Float32Array(0);

  constructor(private core: Core) {}

  /** `writer`'s numbers shown on the records drawn on node `node` from now on. */
  hold(node: number, writer: OwnWriter): void {
    const held = this.byNode.get(node);
    if (held) {
      held.writer = writer;
      held.holders++;
    } else {
      this.byNode.set(node, { writer, holders: 1 });
    }
  }

  /** One of the meshes that held a kit on `node` let go of it; the node's numbers cleared once none holds it. */
  release(node: number): void {
    const held = this.byNode.get(node);
    if (!held || --held.holders > 0) return;
    this.byNode.delete(node);
    const view = this.viewFor(node);
    view.fill(0, node * OWN_FLOATS, (node + 1) * OWN_FLOATS);
  }

  /** Every held node's numbers written as its kit or look stands now. */
  write(): void {
    let most = -1;
    for (const node of this.byNode.keys()) if (node > most) most = node;
    if (most < 0) return;
    const view = this.viewFor(most);
    for (const [node, held] of this.byNode) held.writer(view, node * OWN_FLOATS);
  }

  /** The engine's nodes' own numbers, viewed with room for node `node`: adding nodes or growing memory moves them. */
  private viewFor(node: number): Float32Array {
    const engine = this.core.engine, memory = this.core.memory;
    const at = engine.node_own(), length = (node + 1) * OWN_FLOATS;
    const view = this.view;
    if (view.buffer !== memory || view.byteOffset !== at || view.length < length) {
      this.view = new Float32Array(memory, at, length);
    }
    return this.view;
  }
}
