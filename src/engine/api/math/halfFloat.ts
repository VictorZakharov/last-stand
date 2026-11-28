// Numbers stored in 16 bits (IEEE 754 half precision), for a map of half floats the page fills itself (the sight's
// strip of rays: core/sight.ts). Three's `DataUtils.toHalfFloat` and `fromHalfFloat` (three.js 0.187.0, MIT,
// extras/DataUtils.js), giving the same bits: the float's own read through a shared buffer, its exponent rebased and
// its fraction cut to ten bits, the rest dropped (three's tables truncate, they don't round).

const floatView = new Float32Array(1);
const bitsView = new Uint32Array(floatView.buffer);

/** `value` as a half float's 16 bits (out of its range, the largest half or infinity, as three's). */
export function toHalfFloat(value: number): number {
  floatView[0] = Math.max(-65504, Math.min(65504, value));
  const bits = bitsView[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const fraction = bits & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (fraction ? 0x200 : 0);
  const rebased = exponent - 127 + 15;
  if (rebased >= 0x1f) return sign | 0x7c00;
  if (rebased <= 0) {
    // (too small for a normal half: a subnormal one, its fraction shifted down by how far under it falls)
    if (rebased < -10) return sign;
    const whole = fraction | 0x800000;
    const shift = 14 - rebased;
    return sign | (whole >> shift);
  }
  return sign | (rebased << 10) | (fraction >> 13);
}

/** A half float's 16 bits as the number they hold. */
export function fromHalfFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
