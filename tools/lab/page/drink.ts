// The healing draught as drunk (tools/lab): how far the flask's mouth is from the lips (the `mouth` point on the head
// that `drink` aims it at) and how far the flask is tipped up, read off the model as drawn. Read beside the sheet's
// pictures of the drink. Measured first when the arm met the lips in the pose but the body's fitting (`fitArm`, after
// it) pushed the fist 8 cm out in front of the face, the elbow straight down having put the forearm through the chest.
import * as THREE from 'three';
import type { Lab } from './lab';

const _lips = new THREE.Vector3(), _at = new THREE.Vector3(), _base = new THREE.Vector3(), _wrist = new THREE.Vector3();

/** the drink's line for the notes, or none while no flask is out */
export function describeDrink(lab: Lab): string | null {
  const root = lab.model.root;
  const flask = root.getObjectByName('flask');
  if (!flask || !flask.visible) return null;
  const mouth = root.getObjectByName('mouth');
  if (!mouth) throw new Error(`lab: drink: the ${lab.player.cls.id} shows a flask but has no mouth point to drink at`);
  // (read off the flask's own point at its lip: a build before it had one, as an A/B's other side may be, says so)
  const lip = flask.getObjectByName('flaskLip');
  if (!lip) return 'the flask: no lip point to measure (a build before the drink was measured)';
  root.updateWorldMatrix(true, true);
  mouth.getWorldPosition(_lips);
  lip.getWorldPosition(_at);
  flask.getWorldPosition(_base);
  // (up from level: the flask's neck below its bulb is tipped up, drinking)
  const up = Math.asin(THREE.MathUtils.clamp(_base.sub(_at).normalize().y, -1, 1)) * 180 / Math.PI;
  const off = _at.distanceTo(_lips) * 100;
  // (and where a miss comes from: the wrist off where the drink put it, or the fist closed off where it planned the grip)
  flask.parent!.getWorldPosition(_wrist);
  const wristOff = _wrist.distanceTo(flask.userData.wrist as THREE.Vector3) * 100;
  const gripOff = flask.getWorldPosition(_base).distanceTo(flask.userData.grip as THREE.Vector3) * 100;
  return `the flask: its mouth ${off.toFixed(1)} cm from the lips, its bulb ${up.toFixed(0)}° ${up >= 0 ? 'above' : 'below'} its mouth`
    + ` (the wrist ${wristOff.toFixed(1)} cm off where the drink put it, the grip ${gripOff.toFixed(1)} cm off its plan)`;
}
