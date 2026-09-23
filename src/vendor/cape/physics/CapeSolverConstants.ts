// Shared CPU/WebGPU solver policy. These values are intentionally separate
// from user-facing tuning: changing them changes established cape behavior.
export const MAXIMUM_PLANAR_CAPE_PARTICLE_SPEED = 9.6;
export const MAXIMUM_VERTICAL_CAPE_PARTICLE_SPEED = 12;
export const BODY_CONTACT_RECONCILIATION_START = 0.000_5;
export const BODY_CONTACT_RECONCILIATION_FULL = 0.025;
export const IDLE_DRAPE_RECOVERY_PER_STEP = 0.016;
export const IDLE_DRAPE_RECOVERY_TARGET = 0.12;
export const IDLE_DRAPE_RECOVERY_DELAY_SECONDS = 0.12;
export const IDLE_DRAPE_RECOVERY_RAMP_SECONDS = 0.35;
export const WAKE_SPEED = 0.08;

// CPU sleep policy. WebGPU deliberately keeps solving because it cannot
// evaluate the required shape reductions without a readback fence.
export const SLEEP_AFTER_SETTLED_SECONDS = 0.55;
export const SETTLED_MOTION_THRESHOLD = 0.0025;
export const MINIMUM_SETTLED_LOWER_CAPE_DROP = 0.48;
export const MAXIMUM_SETTLED_HORIZONTAL_OFFSET = 0.18;
export const IDLE_DRAPE_RECOVERY_HEM_DROP = 1.2;
export const MAXIMUM_SLEEP_BODY_PENETRATION = 0.001;
