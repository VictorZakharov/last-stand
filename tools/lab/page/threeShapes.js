// The scene API's generators and curves bound to three.js, for an A/B's other side alone (see `threeAsApi.js`): each
// generator a function making three's geometry from the same arguments in the same order, as the API's do.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** A function making three's `Kind` from the arguments it's given. */
const made = (Kind) => (...args) => new Kind(...args);

export const sphere = made(THREE.SphereGeometry);
export const box = made(THREE.BoxGeometry);
export const cylinder = made(THREE.CylinderGeometry);
export const cone = made(THREE.ConeGeometry);
export const torus = made(THREE.TorusGeometry);
export const torusKnot = made(THREE.TorusKnotGeometry);
export const lathe = made(THREE.LatheGeometry);
export const plane = made(THREE.PlaneGeometry);
export const circle = made(THREE.CircleGeometry);
export const ring = made(THREE.RingGeometry);
export const capsule = made(THREE.CapsuleGeometry);
export const icosahedron = made(THREE.IcosahedronGeometry);
export const octahedron = made(THREE.OctahedronGeometry);
export const dodecahedron = made(THREE.DodecahedronGeometry);
export const polyhedron = made(THREE.PolyhedronGeometry);
export const tube = made(THREE.TubeGeometry);
export const extrude = made(THREE.ExtrudeGeometry);
export const flat = made(THREE.ShapeGeometry);
export const roundedBox = made(RoundedBoxGeometry);

// (`Curve` and `Path` are three's own names: `threeAsApi.js` passes them on from three)
export const Outline = THREE.Shape;
export const CatmullRom3 = THREE.CatmullRomCurve3;
export const Line3Curve = THREE.LineCurve3;
export const Line2Curve = THREE.LineCurve;
export const Bezier2Curve3 = THREE.QuadraticBezierCurve3;
export const Bezier3Curve3 = THREE.CubicBezierCurve3;
export const Bezier2Curve2 = THREE.QuadraticBezierCurve;
export const Bezier3Curve2 = THREE.CubicBezierCurve;
export const Ellipse = THREE.EllipseCurve;
export const triangulate = THREE.ShapeUtils.triangulateShape;
export const area = THREE.ShapeUtils.area;
export const isClockWise = THREE.ShapeUtils.isClockWise;
