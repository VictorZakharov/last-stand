// The foes drawn as one (Bulwark's nodes.rs, VictorZakharov/last-stand#973): a body's skinned meshes are ordinary
// meshes of the stage (`draws.ts`), each kept on its body's root's node (`userData.drawnOn`) and culled there by how
// far the body reaches (`userData.reach`), skinned by the engine from its joints' nodes. What this adds is what no
// field write tells the stage of: a slot's casting, read through its pieces' (the quality's level sets theirs), so
// each frame's casting is compared and a slot whose casting moved is drawn again. Written a record and its bones a
// frame, a wave 36's 34 foes were half the page's work a frame with their placing (`lab perf --wave 36 --profile`).
import type { Mesh } from './api/index.ts';
import type { Core } from './core';
import { tunable } from '../core/tuning';
import { eachAsOne } from '../entities/models/bodyAsOne';
import type { Draws } from './draws';

/** whether the scene's moving parts are the engine's nodes (1) or written a record and a bone a frame (0) */
export const BODY_NODES = tunable('bodyNodes', { on: 1 });

export class Bodies {
  /** each slot's casting as last drawn */
  private casting = new WeakMap<Mesh, boolean>();
  private bodies = 0;

  constructor(private core: Core, private draws: Draws) {}

  /** How many bodies are drawn as one. */
  get count(): number { return this.bodies; }

  /** Each slot whose casting moved since it was drawn, drawn again. Before the frame's draws. */
  sync(): void {
    let bodies = 0;
    eachAsOne((_body, one) => {
      bodies++;
      for (const mesh of one.meshes) {
        const casts = mesh.castShadow;
        if (this.casting.get(mesh) === casts) continue;
        this.casting.set(mesh, casts);
        this.draws.redraw(mesh);
      }
    });
    this.bodies = bodies;
  }

  /** Every slot's casting forgotten (what was handed over is: the draws write every mesh again). */
  forget(): void {
    this.casting = new WeakMap();
  }

  /** What the last frame drew of the nodes: their records, their bones' floats, how many were out of view, and how
   *  many nodes the engine holds. */
  drawn(): { records: number; boneFloats: number; culled: number; nodes: number } {
    const [records, boneFloats, culled, nodes] = this.core.engine.nodes_drawn();
    return { records, boneFloats, culled, nodes };
  }
}
