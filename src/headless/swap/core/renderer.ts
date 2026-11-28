// The renderer, for the fight with nothing drawn: no camera to shake, no frame to measure, no passes to set.
import * as THREE from 'three';
import type * as Real from '../../../core/renderer';

const FRAME = { left: 0, top: 0, bottom: 0, width: 1920, height: 1080 };

export const addShake: typeof Real.addShake = () => undefined;
export const drawArms: typeof Real.drawArms = () => undefined;
export const frameRect: typeof Real.frameRect = () => ({ ...FRAME });
export const overFrame: typeof Real.overFrame = { draw: () => undefined, empty: () => true };
export const passCamera: typeof Real.passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export const passTriangle: typeof Real.passTriangle = () => new THREE.BufferGeometry();
export const pointScale: typeof Real.pointScale = () => FRAME.height;
export const setBloomShare: typeof Real.setBloomShare = () => undefined;
export const setRenderQuality: typeof Real.setRenderQuality = () => undefined;
export const setResolutionShare: typeof Real.setResolutionShare = () => undefined;
export const setShadowInTurns: typeof Real.setShadowInTurns = () => undefined;
export const viewMode: typeof Real.viewMode = () => 'top';
