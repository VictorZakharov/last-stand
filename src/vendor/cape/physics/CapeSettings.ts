import * as THREE from 'three';
import { CAPE } from '../config';

export interface CapePhysicsSettings {
  readonly length: number;
  readonly width: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly weight: number;
}

export const CAPE_PHYSICS_SETTING_RANGES = {
  length: CAPE.lengthRange,
  width: CAPE.widthRange,
  stiffness: { min: 0.1, max: 1.5, step: 0.05 },
  damping: { min: 0.5, max: 1.8, step: 0.05 },
  weight: { min: 0.5, max: 1.5, step: 0.05 },
} as const;

export const DEFAULT_CAPE_PHYSICS_SETTINGS: CapePhysicsSettings = Object.freeze({
  length: CAPE.length,
  width: CAPE.width,
  stiffness: 1,
  damping: 1,
  weight: 1,
});

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeCapePhysicsSettings(
  settings: Partial<CapePhysicsSettings> = {},
): CapePhysicsSettings {
  return {
    length: THREE.MathUtils.clamp(
      finiteOrDefault(settings.length, DEFAULT_CAPE_PHYSICS_SETTINGS.length),
      CAPE_PHYSICS_SETTING_RANGES.length.min,
      CAPE_PHYSICS_SETTING_RANGES.length.max,
    ),
    width: THREE.MathUtils.clamp(
      finiteOrDefault(settings.width, DEFAULT_CAPE_PHYSICS_SETTINGS.width),
      CAPE_PHYSICS_SETTING_RANGES.width.min,
      CAPE_PHYSICS_SETTING_RANGES.width.max,
    ),
    stiffness: THREE.MathUtils.clamp(
      finiteOrDefault(settings.stiffness, DEFAULT_CAPE_PHYSICS_SETTINGS.stiffness),
      CAPE_PHYSICS_SETTING_RANGES.stiffness.min,
      CAPE_PHYSICS_SETTING_RANGES.stiffness.max,
    ),
    damping: THREE.MathUtils.clamp(
      finiteOrDefault(settings.damping, DEFAULT_CAPE_PHYSICS_SETTINGS.damping),
      CAPE_PHYSICS_SETTING_RANGES.damping.min,
      CAPE_PHYSICS_SETTING_RANGES.damping.max,
    ),
    weight: THREE.MathUtils.clamp(
      finiteOrDefault(settings.weight, DEFAULT_CAPE_PHYSICS_SETTINGS.weight),
      CAPE_PHYSICS_SETTING_RANGES.weight.min,
      CAPE_PHYSICS_SETTING_RANGES.weight.max,
    ),
  };
}
