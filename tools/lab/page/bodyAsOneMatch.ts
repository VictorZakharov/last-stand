// Each foe drawn as one (`src/entities/models/bodyAsOne.ts`) held to its own pieces: every vertex of its merged meshes
// skinned as the engine skins it, against the same vertex of the piece it came from, placed where that piece hangs
// now. A joint left out, a rigid piece merged on the wrong joint or a bind pose taken in another place shows as
// vertices metres off; the same body drawn both ways is the same to a fraction of a millimetre.
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Enemy } from '../../../src/entities/enemy';

/** How far one body's merged vertices lie from its pieces', m. */
export interface BodyMatch {
  type: string;
  /** the vertices compared, the farthest apart and their mean */
  vertices: number;
  most: number;
  mean: number;
  /** the piece whose vertex was farthest off, by its parent's name */
  worst: string;
}

/** a merged vertex may lie this far from its piece's, m: float rounding through two matrices */
export const MATCH_MOST = 0.002;

const _drawn = new THREE.Vector3();
const _piece = new THREE.Vector3();

/** The meshes a body is drawn as, by the link each keeps to its body's root. */
function meshesFor(foe: Enemy): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  G.scene.traverse((object) => {
    if (object.userData.bodyOf === foe.model.root) out.push(object as THREE.SkinnedMesh);
  });
  return out;
}

/** Where a piece's vertex `index` is drawn now: skinned on its bones, or placed by its matrix. */
function pieceVertex(piece: THREE.Mesh, index: number, out: THREE.Vector3): THREE.Vector3 {
  const skinned = piece as THREE.SkinnedMesh;
  if (skinned.isSkinnedMesh) return skinned.getVertexPosition(index, out).applyMatrix4(piece.matrixWorld);
  return out.fromBufferAttribute(piece.geometry.attributes.position, index).applyMatrix4(piece.matrixWorld);
}

/** The pieces a body's merged meshes came from, in the order the merge laid them, a list a mesh. */
type PiecesOf = (foe: Enemy) => THREE.Mesh[][];

/**
 * `foe`'s merged vertices against its pieces'. `piecesOf` gives the pieces of each of its meshes in their merged
 * order (the module's own `slotPieces`); a piece whose geometry is indexed was merged unindexed, its vertices by
 * the index. `place` puts the pieces where they hang now, as anything that reads them asks first.
 */
export function matchBody(foe: Enemy, piecesOf: PiecesOf, place: (root: THREE.Object3D) => void): BodyMatch | null {
  const meshes = meshesFor(foe);
  if (!meshes.length) return null;
  foe.model.root.updateMatrixWorld(true);
  // (its pieces, unseen, are placed only where they're read)
  place(foe.obj);
  const lists = piecesOf(foe);
  let vertices = 0;
  let most = 0;
  let sum = 0;
  let worst = '';
  meshes.forEach((mesh, slot) => {
    mesh.skeleton.update();
    let at = 0;
    for (const piece of lists[slot]) {
      const index = piece.geometry.index;
      const count = index ? index.count : piece.geometry.attributes.position.count;
      for (let i = 0; i < count; i++, at++) {
        mesh.getVertexPosition(at, _drawn);
        pieceVertex(piece, index ? index.getX(i) : i, _piece);
        const off = _drawn.distanceTo(_piece);
        vertices++;
        sum += off;
        if (off > most) {
          most = off;
          worst = piece.parent?.name || piece.name;
        }
      }
    }
  });
  return { type: foe.type, vertices, most, mean: sum / Math.max(1, vertices), worst };
}
