// The gates' portals' materials: `portalMembrane`'s swirling membrane and the light it spills over the floor
// (props.ts), each a look material drawn by its look alone (engine/looks/portal.ts: the WGSL), the membrane fading as
// the gate round it dissolves (its look's `fades`).
import { AdditiveBlending, Color, DoubleSide, LookMaterial } from '../engine/api/index.ts';
import { rustLook } from '../engine/custom';
import { membraneLook, spillLook } from '../engine/looks/portal';
import { seeValue } from '../core/seeThrough';

/** The portal's uniforms as props.ts keeps them (each `{ value }`, read as each frame draws; a type, not an
 *  interface, so it is a look material's uniforms as it is). */
export type PortalUniforms = {
  uTime: { value: number };
  uPower: { value: number };
  uArch: { value: number };
  uA: { value: Color };
  uB: { value: Color };
  uCore: { value: Color };
};

/** The membrane: a vortex twisting round a dark heart and a bright core, sparks swept round it, a crackling rim
 *  round a rounded rectangle (or straight sides under a round top), alpha-blended over what's behind the gate. */
export function membraneMaterial(uniforms: PortalUniforms): LookMaterial<PortalUniforms> {
  const material = new LookMaterial({ uniforms, transparent: true, depthWrite: false, side: DoubleSide });
  return rustLook(material, { ...membraneLook(uniforms), fades: seeValue('prop') });
}

/** The light the portal spills across the floor in front of the gate, added. */
export function spillMaterial(uniforms: PortalUniforms): LookMaterial<PortalUniforms> {
  const material = new LookMaterial({ uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending });
  return rustLook(material, spillLook(uniforms));
}
