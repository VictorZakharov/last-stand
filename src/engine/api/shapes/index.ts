// The shapes: the generators as functions returning a geometry, and the curves and outlines they're drawn along.
export { sphere, capsule, torus, torusKnot } from './round.ts';
export { cylinder, cone, lathe } from './turned.ts';
export { box, plane, circle, ring } from './flatFaces.ts';
export { polyhedron, icosahedron, octahedron, dodecahedron } from './polyhedra.ts';
export { tube } from './tube.ts';
export { extrude } from './extrude.ts';
export type { ExtrudeOptions } from './extrude.ts';
export { flat, roundedBox } from './flat.ts';
export { Curve } from './curve.ts';
export type { CurvePoint, FrenetFrames } from './curve.ts';
export { CatmullRom3, Line3Curve, Bezier2Curve3, Bezier3Curve3, Line2Curve, Bezier2Curve2, Bezier3Curve2 } from './curves.ts';
export type { CatmullRomKind } from './curves.ts';
export { Ellipse, Path, Outline } from './path.ts';
export type { OutlinePoints } from './path.ts';
export { area, isClockWise, triangulate } from './triangulate.ts';
export { earcut } from './earcut.ts';
