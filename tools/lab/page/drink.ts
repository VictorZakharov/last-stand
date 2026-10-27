// The healing draught as drunk (tools/lab): how far the flask's mouth is from the lips (the `mouth` point on the head
// that `drink` aims it at) and how far the flask is tipped up, read off the model as drawn. Read beside the sheet's
// pictures of the drink. Measured first when the arm met the lips in the pose but the body's fitting (`fitArm`, after
// it) pushed the fist 8 cm out in front of the face, the elbow straight down having put the forearm through the chest.
import * as THREE from 'three';
import { flaskMouth } from '../../../src/entities/models/flask';
import type { Lab } from './lab';

const _lips = new THREE.Vector3(), _at = new THREE.Vector3(), _base = new THREE.Vector3();

/** the drink's line for the notes, or none while no flask is out */
export function describeDrink(lab: Lab): string | null {
  const root = lab.model.root;
  const flask = root.getObjectByName('flask');
  if (!flask || !flask.visible) return null;
  const mouth = root.getObjectByName('mouth');
  if (!mouth) throw new Error(`lab: drink: the ${lab.player.cls.id} shows a flask but has no mouth point to drink at`);
  root.updateWorldMatrix(true, true);
  mouth.getWorldPosition(_lips);
  flaskMouth(flask, _at);
  flask.getWorldPosition(_base);
  // (up from level: the flask's neck below its bulb is tipped up, drinking)
  const up = Math.asin(THREE.MathUtils.clamp(_base.sub(_at).normalize().y, -1, 1)) * 180 / Math.PI;
  const off = _at.distanceTo(_lips) * 100;
  return `the flask: its mouth ${off.toFixed(1)} cm from the lips, its bulb ${up.toFixed(0)}° ${up >= 0 ? 'above' : 'below'} its mouth`;
}
