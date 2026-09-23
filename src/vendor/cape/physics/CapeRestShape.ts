import * as THREE from 'three';
import { CAPE } from '../config';

const SHOULDER_WIDTH = 0.5;
const SHOULDER_EXPANSION_END = 0.1;
// This is a unilateral collapse limit, not a width spring. Healthy cloth is
// comfortably above it, so normal waves and contact folds remain untouched.
export const MINIMUM_CAPE_ROW_SPAN_RATIO = 0.38;
export const CAPE_ROW_SPAN_RELAXATION = 0.65;
// A cape row may bow gently around the body or a formation, but its interior
// cannot wrap far away from the chord between its outer edges. Limiting only
// endpoint span still permits the U-shaped, tubular cross-section that made
// the GPU cape look like a rigid windsock.
export const MAXIMUM_CAPE_ROW_CURL_RATIO = 0.12;
export const CAPE_ROW_CURL_RELAXATION = 0.7;

export function getCapeRestWidth(
  anchorWidth: number,
  down: number,
  capeWidth: number = CAPE.width,
): number {
  const normalizedDown = THREE.MathUtils.clamp(down, 0, 1);
  const shoulderBlend = THREE.MathUtils.smoothstep(
    normalizedDown,
    0,
    SHOULDER_EXPANSION_END,
  );
  const shoulderTarget = Math.max(anchorWidth, SHOULDER_WIDTH);
  const shoulderWidth = THREE.MathUtils.lerp(anchorWidth, shoulderTarget, shoulderBlend);
  const lowerFlare = normalizedDown * normalizedDown * (3 - 2 * normalizedDown);
  return THREE.MathUtils.lerp(shoulderWidth, capeWidth * 1.16, lowerFlare);
}

export function getCapeRestBackOffset(down: number, across: number): number {
  const normalizedDown = THREE.MathUtils.clamp(down, 0, 1);
  const centered = 1 - Math.abs(THREE.MathUtils.clamp(across, -0.5, 0.5)) * 2;
  const establishedBodyDrape = 0.008
    + normalizedDown * 0.1
    + (1 - normalizedDown) ** 2 * centered * 0.035;
  const neckDrape = 0.009
    + normalizedDown * 0.045
    + (1 - normalizedDown) ** 2 * centered * 0.035;
  const firstFreeRow = 1 / (CAPE.rows - 1);
  const bodyDrapeRow = 3 / (CAPE.rows - 1);
  const bodyBlend = THREE.MathUtils.smoothstep(
    normalizedDown,
    firstFreeRow,
    bodyDrapeRow,
  );
  const upperBackContour = Math.max(
    0,
    1 - Math.abs(normalizedDown - 0.15) / 0.16,
  ) * centered * 0.028;
  return THREE.MathUtils.lerp(neckDrape, establishedBodyDrape, bodyBlend)
    + upperBackContour;
}
