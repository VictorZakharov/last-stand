// Where the over-the-shoulder camera frames a seated hero (tools/lab `sit`): zoomed in all the way, his neck's height
// on the screen sat against standing. From play: "zoom in/out with mouse wheel in 3rd person should zoom in on the
// seated character, not the standing one (if seated)": the camera closed on where a standing hero's shoulders would
// be, over a seated one's head.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { saveCamera, setView, viewMode, zoomBy } from '../../../src/core/renderer';
import type { Lab } from './lab';

/** the mouse wheel's notches in, past the closest the view goes */
const ALL_THE_WAY_IN = -40;
/** frames for the camera to glide to the view and come to rest */
const SETTLE = 90;
/** how far his neck may sit on the screen from where it is standing, as a share of the screen's half height */
export const FRAMED_MOST = 0.15;

/** His neck's height on the screen (-1 its bottom, 1 its top) in the third-person view zoomed in all the way, the
 *  game's own camera put back as it was after. */
export async function neckOnScreen(lab: Lab): Promise<number> {
  const restore = saveCamera();
  const was = viewMode();
  setView('third');
  zoomBy(ALL_THE_WAY_IN);
  await lab.step(SETTLE);
  const neck = lab.joints.neck.getWorldPosition(new THREE.Vector3()).project(G.camera);
  setView(was);
  restore();
  return neck.y;
}
