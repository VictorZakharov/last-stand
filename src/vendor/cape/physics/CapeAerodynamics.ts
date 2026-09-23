// A deterministic normal flutter keeps motion visible even when a parallel
// constraint sweep preserves perfect grid symmetry. It is shared by both
// solvers so WebGL and WebGPU receive the same physical excitation.
export const CAPE_FLUTTER_ACCELERATION = 10;

// Material damping is independent of character speed. Raising it with player
// speed damps particles toward the stationary world frame while the neckline
// keeps moving, producing an artificial horizontal "Superman" equilibrium.
// Collision and reversal energy are handled at their actual constraints.
export const CAPE_DRAG_PER_SECOND = 2.8;

// Fixed-step Verlet displacement is an implicit velocity. Constraint
// projection can otherwise feed an arbitrarily large correction into the next
// step, especially after rapid character reversals. Bound that carried motion
// to a physically plausible cloth-tip speed while leaving gravity, airflow,
// and current-step constraint response untouched.
export const MAXIMUM_CAPE_PARTICLE_SPEED = 12;
