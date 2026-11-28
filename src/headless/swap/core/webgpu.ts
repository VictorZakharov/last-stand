// three's WebGPU side, for the fight with nothing drawn: its node language and materials loaded as the page loads them
// (what the battlegrounds' builders make their looks of: built, never compiled), and nothing to draw over a frame.
import * as THREE from 'three';
import * as nodeMaterials from 'three/webgpu';
import * as nodeLanguage from 'three/tsl';
import type * as Real from '../../../core/webgpu';

export const gpu: typeof Real.gpu = nodeMaterials;
export const tsl: typeof Real.tsl = nodeLanguage;
export const stillNodes: typeof Real.stillNodes = new WeakSet();
export const drawOverFrame: typeof Real.drawOverFrame = () => undefined;
export const copyCanvasInto: typeof Real.copyCanvasInto = () => false;
export const labelsMaterial: typeof Real.labelsMaterial = () => ({ material: new THREE.MeshBasicMaterial(), setAtlas: () => undefined });
