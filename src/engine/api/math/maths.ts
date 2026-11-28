// The maths' plain functions, three's `MathUtils` by the same names and arguments, gathered as `Maths`.

/** degrees to radians, as a factor */
export const DEG2RAD = Math.PI / 180;
/** radians to degrees, as a factor */
export const RAD2DEG = 180 / Math.PI;

/** `value` kept between `min` and `max` */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** the remainder of `n / m`, always of `divisor`'s sign (`-1 mod 3` is 2) */
export function euclideanModulo(dividend: number, divisor: number): number {
  return ((dividend % divisor) + divisor) % divisor;
}

/** `x` mapped from the range `a1..a2` to `b1..b2` */
export function mapLinear(x: number, a1: number, a2: number, b1: number, b2: number): number {
  return b1 + (x - a1) * (b2 - b1) / (a2 - a1);
}

/** how far `value` is from `x` to `y`, 0 to 1 between them (0 when they're equal) */
export function inverseLerp(x: number, y: number, value: number): number {
  if (x === y) return 0;
  return (value - x) / (y - x);
}

/** the point `amount` of the way from `x` to `y` */
export function lerp(x: number, y: number, amount: number): number {
  return (1 - amount) * x + amount * y;
}

/** `x` eased towards `y` at the rate `lambda` over `dt`, the same whatever the frame rate */
export function damp(x: number, y: number, lambda: number, dt: number): number {
  return lerp(x, y, 1 - Math.exp(-lambda * dt));
}

/** `x` bounced back and forth between 0 and `length` */
export function pingpong(x: number, length = 1): number {
  return length - Math.abs(euclideanModulo(x, length * 2) - length);
}

/** 0 below `min`, 1 above `max`, eased between (Hermite: zero slope at both ends) */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const amount = (x - min) / (max - min);
  return amount * amount * (3 - 2 * amount);
}

/** `smoothstep` with zero slope and curvature at both ends (Perlin's) */
export function smootherstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const amount = (x - min) / (max - min);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

/** a random whole number from `low` to `high`, both included */
export function randInt(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

/** a random number from `low` to `high` */
export function randFloat(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

/** a random number from `-range / 2` to `range / 2` */
export function randFloatSpread(range: number): number {
  return range * (0.5 - Math.random());
}

/** the seed `seededRandom` steps */
let seed = 1234567;

/**
 * A random number from 0 to 1 by a seed of its own (mulberry32), its seed set first when one is given.
 * Follows three.js 0.187.0's `MathUtils.seededRandom` (the same seed gives the same numbers).
 */
export function seededRandom(newSeed?: number): number {
  if (newSeed !== undefined) seed = newSeed;
  seed += 0x6d2b79f5;
  let amount = seed;
  amount = Math.imul(amount ^ (amount >>> 15), amount | 1);
  amount ^= amount + Math.imul(amount ^ (amount >>> 7), amount | 61);
  return ((amount ^ (amount >>> 14)) >>> 0) / 4294967296;
}

/** the hex digits of a byte */
const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/** a random version 4 UUID, in lower case */
export function generateUUID(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map(byte => HEX[byte]);
  const parts = [hex.slice(0, 4), hex.slice(4, 6), hex.slice(6, 8), hex.slice(8, 10), hex.slice(10)];
  return parts.map(part => part.join('')).join('-');
}

/** degrees in radians */
export function degToRad(degrees: number): number {
  return degrees * DEG2RAD;
}

/** radians in degrees */
export function radToDeg(radians: number): number {
  return radians * RAD2DEG;
}

/** whether a whole number is a power of two */
export function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0 && value !== 0;
}

/** the least power of two not under `value` */
export function ceilPowerOfTwo(value: number): number {
  return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}

/** the greatest power of two not over `value` */
export function floorPowerOfTwo(value: number): number {
  return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}

/** three's `MathUtils`: the functions above under one name */
export const Maths = {
  DEG2RAD,
  RAD2DEG,
  clamp,
  euclideanModulo,
  mapLinear,
  inverseLerp,
  lerp,
  damp,
  pingpong,
  smoothstep,
  smootherstep,
  randInt,
  randFloat,
  randFloatSpread,
  seededRandom,
  generateUUID,
  degToRad,
  radToDeg,
  isPowerOfTwo,
  ceilPowerOfTwo,
  floorPowerOfTwo,
} as const;
