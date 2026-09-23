export interface CapeProjectionVerticalVelocityState {
  readonly predictedVerticalDisplacement: number;
  readonly projectedPositionY: number;
  readonly previousPositionY: number;
  readonly hasMaterialContact: boolean;
}

/**
 * Projection repairs position, not momentum. When physical prediction was
 * falling, an upward length repair must not be encoded as upward Verlet
 * velocity. Material contact is exempt because clearing a floor, rock, or
 * animated body can legitimately require an upward response.
 */
export function reconcileCapeProjectionPreviousY({
  predictedVerticalDisplacement,
  projectedPositionY,
  previousPositionY,
  hasMaterialContact,
}: CapeProjectionVerticalVelocityState): number {
  if (
    hasMaterialContact
    || predictedVerticalDisplacement >= 0
    || projectedPositionY <= previousPositionY
  ) return previousPositionY;
  return projectedPositionY;
}
