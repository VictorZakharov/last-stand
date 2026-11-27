// `lab rustcheck`'s foes drawn as one (`src/entities/models/bodyAsOne.ts`): each standing foe of the fight drawn by
// a mesh a material on its own joints, and those meshes holding every vertex where its piece hangs now
// (`bodyAsOneMatch.ts`). From play, a party at wave 36 sent 2,668 draws on a laptop whose CPU took 25 ms a frame,
// each foe 31 to 50 pieces walked and written a frame. The canary: two of one body's joints swapped, which must put
// its vertices metres off.
import { Mesh, Node, Skeleton, SkinnedMesh } from './sceneApi.ts';
import { G } from '../../../src/state';
import type { Enemy } from '../../../src/entities/enemy';
import type { CrowdBody } from '../../../src/entities/models/crowd';
import { type Checked, failed, passed } from './rustPixels';
import { MATCH_MOST, matchBody } from './bodyAsOneMatch';

/** the game's module that draws a body as one, where this tree has it (an A/B's other side may not) */
type AsOne = {
  slotPieces: (body: CrowdBody) => Mesh[][];
  drawnAsOne: (body: CrowdBody) => boolean;
  placeUnplaced: (root: Node) => void;
};
const AS_ONE = import.meta.glob<AsOne>('../../../src/entities/models/bodyAsOne.ts');

/** a canary's body must be put at least this far off by two of its joints swapped, m */
const CANARY_LEAST = 0.05;

/** Whether `object` was handed to the engine as part of `foe`: under its root, or drawn as one for it. */
export function drawnFor(foe: Enemy, watched: Set<Node>): boolean {
  for (const object of watched) {
    if (object.userData.bodyOf === foe.model.root) return true;
  }
  let drawn = false;
  foe.obj.traverse((part) => {
    drawn ||= watched.has(part);
  });
  return drawn;
}

/** The module drawing bodies as one, or null where this tree has none. */
async function asOne(): Promise<AsOne | null> {
  const load = Object.values(AS_ONE)[0];
  return load ? load() : null;
}

/** The farthest any merged vertex of `foes` lies from its piece's, m, and the foe it's on. */
function farthest(foes: Enemy[], module: AsOne): { most: number; worst: string; vertices: number } {
  let most = 0;
  let worst = '';
  let vertices = 0;
  for (const foe of foes) {
    const match = matchBody(foe, module.slotPieces, module.placeUnplaced);
    if (!match) continue;
    vertices += match.vertices;
    if (match.most > most) {
      most = match.most;
      worst = `${match.type} (by ${match.worst || 'its root'})`;
    }
  }
  return { most, worst, vertices };
}

/** `foe`'s skeleton with two of its joints swapped while `measure` runs: the canary's fault. */
function withJointsSwapped<T>(foe: Enemy, measure: () => T): T {
  let skeleton: Skeleton | null = null;
  G.scene.traverse((object) => {
    if (!skeleton && object.userData.bodyOf === foe.model.root) skeleton = (object as SkinnedMesh).skeleton;
  });
  const bones = (skeleton as Skeleton | null)?.bones;
  if (!bones || bones.length < 2) throw new Error('lab: the canary found no skeleton to plant its fault in');
  const last = bones.length - 1;
  [bones[0], bones[last]] = [bones[last], bones[0]];
  try {
    return measure();
  } finally {
    [bones[0], bones[last]] = [bones[last], bones[0]];
  }
}

/** Every standing foe drawn as one, each vertex where its piece hangs; the canary caught. */
export async function bodiesAsOne(foes: Enemy[]): Promise<Checked> {
  const module = await asOne();
  if (!module) return passed('no foe drawn as one in this tree');
  const standing = foes.filter((foe) => foe.alive);
  const apart = standing.filter((foe) => !module.drawnAsOne(foe));
  if (apart.length) return failed(`${apart.length} of ${standing.length} foes drawn piece by piece (${apart[0].type})`);
  const { most, worst, vertices } = farthest(standing, module);
  if (!vertices) return failed('no foe\'s vertices were compared');
  const planted = withJointsSwapped(standing[0], () => farthest([standing[0]], module).most);
  const line = `${standing.length} foes drawn as one, ${vertices} vertices: the farthest `
    + `${(most * 1000).toFixed(3)} mm from its piece (${worst}); two joints swapped ${planted.toFixed(2)} m`;
  if (most > MATCH_MOST) return failed(`${line}: over ${MATCH_MOST * 1000} mm`);
  if (planted < CANARY_LEAST) return failed(`${line}: the canary missed`);
  return passed(line);
}
