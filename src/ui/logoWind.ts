// The loading screen's exit: a gust from the right blows the logo's letters away to the left as
// dust and snow, then the swirl gathers again into the lobby's logo (top left) and becomes it.
// The steel letters (SVG) are snapshotted to device pixels and every pixel becomes a point on the
// pixel grid, so at rest the particle field is the letters exactly and replaces them invisibly;
// the glows stay live and fade. Motion is closed-form in the vertex shader (hundreds of thousands
// of points, no per-frame CPU work) and driven by smooth noise of each point's starting position,
// so neighbours move together in streaks and eddies, like real wind.

const SWEEP = 1.1;                 // s for the wind front to cross the letters, right to left
export const REVEAL_AT = 1.2;      // s: the loading backdrop starts fading to the lobby
const GATHER = 1.45;               // s: points start flying to the lobby logo...
const GATHER_SPREAD = 0.65;        // ...staggered left to right across it...
const GATHER_TIME = 0.85;          // ...each taking this long
const SETTLE = GATHER + GATHER_SPREAD + 0.2 + GATHER_TIME;   // all points are in place
const HANDOFF = 0.35;              // s: particles crossfade to the real lobby logo
// s: the particles fade in over the (still opaque) SVG letters before the wind starts. The
// snapshot matches except for the brushed grain, which the browser samples on its own grid.
const LEAD = 0.25;
const MAX_POINTS = 1_500_000;      // above this the snapshot is sampled every other pixel
const PAD_X = 0.12, PAD_Y = 0.22;  // the letters' rim and drop shadow reach this far outside their box

export interface LogoBlow {
  /** Run the exit; `reveal` fires at REVEAL_AT, `done` once the lobby logo has taken over. */
  start(reveal: () => void, done: () => void): void;
  /** Not running after all: put the lobby logo back. */
  cancel(): void;
}

const letters = (logo: Element): SVGSVGElement | null => logo.querySelector('svg:not(.logo-glow)');

/** Snapshot the letters of `logo` into a particle field that will gather into `target` (both .logo-art). */
export async function prepareBlow(logo: HTMLElement, target: HTMLElement | null): Promise<LogoBlow | null> {
  const metal = letters(logo), glow = logo.querySelector<SVGSVGElement>('svg.logo-glow');
  if (!metal) return null;
  const box = metal.getBoundingClientRect();
  const dst = target && letters(target)?.getBoundingClientRect();
  if (box.width < 10) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  // snapshot area on the device pixel grid, so every point lands exactly on the pixel it copies
  const x0 = Math.floor((box.left - box.width * PAD_X) * dpr), y0 = Math.floor((box.top - box.height * PAD_Y) * dpr);
  const pw = Math.ceil((box.right + box.width * PAD_X) * dpr) - x0, ph = Math.ceil((box.bottom + box.height * PAD_Y) * dpr) - y0;
  const vb = metal.viewBox.baseVal, k = box.width / vb.width;   // CSS px per viewBox unit
  const view = [vb.x + (x0 / dpr - box.left) / k, vb.y + (y0 / dpr - box.top) / k, pw / dpr / k, ph / dpr / k];
  const px = await snapshot(metal, view, pw, ph);
  if (!px) return null;

  let lit = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
  const step = lit > MAX_POINTS ? 2 : 1;
  const n = Math.ceil(lit / (step * step)) + 16;
  const pos = new Float32Array(n * 2), col = new Uint8Array(n * 4), rnd = new Uint8Array(n * 4);
  let c = 0;
  for (let y = 0; y < ph; y += step) for (let x = 0; x < pw; x += step) {
    const o = (y * pw + x) * 4;
    if (px[o + 3] === 0 || c >= n) continue;
    pos[c * 2] = (x0 + x + step / 2) / dpr;   // pixel centre, CSS px
    pos[c * 2 + 1] = (y0 + y + step / 2) / dpr;
    col.set(px.subarray(o, o + 4), c * 4);
    for (let j = 0; j < 4; j++) rnd[c * 4 + j] = Math.random() * 256;
    c++;
  }
  const gather = dst && dst.width > 10 ? { x: dst.left, y: dst.top, scale: dst.width / box.width } : null;
  const field = createField(pos, col, rnd, c, { box, dpr, pointPx: step, gather });
  if (!field) return null;
  // the lobby logo is made of the particles until they have settled
  if (gather) target!.style.opacity = '0';
  const cancel = (): void => { if (target) target.style.opacity = ''; field.dispose(); };
  return {
    cancel,
    start(reveal, done) {
      field.canvas.style.visibility = 'visible';
      field.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LEAD * 1000 });
      let revealed = false, handed = false, swapped = false;
      field.run((t) => {
        if (!swapped && t >= 0) {
          swapped = true;
          metal.style.visibility = 'hidden';   // the particles are the letters now
          // the glow has nothing left to light: it fades as the front crosses
          glow?.animate([{ opacity: getComputedStyle(glow).opacity }, { opacity: 0 }], { duration: SWEEP * 1000, easing: 'ease-in', fill: 'forwards' });
        }
        if (!revealed && t >= REVEAL_AT) { revealed = true; reveal(); }
        if (gather && !handed && t >= SETTLE) {
          handed = true;
          target!.style.transition = `opacity ${HANDOFF}s linear`;
          target!.style.opacity = '';
          target!.addEventListener('transitionend', () => { target!.style.transition = ''; }, { once: true });
        }
      }, () => { field.dispose(); done(); });
    },
  };
}

/** Render the letters' SVG (with the font embedded, which an SVG image can't load) to RGBA pixels. */
async function snapshot(metal: SVGSVGElement, view: number[], w: number, h: number): Promise<Uint8ClampedArray | null> {
  const defs = document.querySelector('.svg-defs defs');
  if (!defs) return null;
  const font = await fontFace('Cinzel', 900).catch(() => '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view.join(' ')}" preserveAspectRatio="none">`
    + `<style>${font}</style>${new XMLSerializer().serializeToString(defs)}${metal.innerHTML}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/** An @font-face rule with the font file inlined, from the page's Google Fonts stylesheet. */
async function fontFace(family: string, weight: number): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
  if (!link) return '';
  const css = await (await fetch(link.href)).text();
  const block = css.split('@font-face').find((b) => b.includes(`'${family}'`) && b.includes(`font-weight: ${weight}`) && /U\+0000-00FF/.test(b));
  const src = block?.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) return '';
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
}

const VERT = /* glsl */`#version 300 es
in vec2 aPos; in vec4 aCol; in vec4 aRnd;
uniform float uT, uPx, uDpr, uFade;
uniform vec2 uView;
uniform vec4 uBox;   // letters' left, top, width, height (CSS px)
uniform vec4 uDst;   // lobby logo left, top, scale; w = 1 when there is one to gather into
out vec4 vCol; out float vRound;
const float SWEEP = ${SWEEP.toFixed(2)}, TEAR = 0.07, OVER = 1.07;
const float GATHER = ${GATHER.toFixed(2)}, SPREAD = ${GATHER_SPREAD.toFixed(2)}, GTIME = ${GATHER_TIME.toFixed(2)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// smooth noise in -1..1
float fbm(vec2 p) { return (noise(p) * 0.65 + noise(p * 2.3 + 7.1) * 0.35) * 2.0 - 1.0; }
// the front is torn: how far it lags at height v (0..1)
float tear(float v) { return TEAR * (0.5 + 0.5 * fbm(vec2(v * 9.0, 2.0))); }

void main() {
  vec2 n = (aPos - uBox.xy) / uBox.zw;   // 0..1 across the letters
  float rel = max(0.0, (1.0 - n.x + tear(clamp(n.y, 0.0, 1.0))) / OVER * SWEEP - aRnd.x * 0.06);
  float W = uBox.z;
  bool gathers = uDst.w > 0.5;
  // when (and how far) this point flies to its place in the lobby logo, left to right
  float g0 = GATHER + SPREAD * clamp(n.x, 0.0, 1.0) + 0.2 * aRnd.x;
  // eased out: it leaves at the wind's speed and slows as it lands
  float g = gathers ? 1.0 - pow(1.0 - clamp((uT - g0) / GTIME, 0.0, 1.0), 3.0) : 0.0;
  // the wind carries it until the gather takes over
  float age = max(0.0, (gathers ? min(uT, g0) : uT) - rel);
  // most pixels become fine dust; a few become snowflakes that are lighter and ride the eddies more
  bool flake = aRnd.w > 0.92;
  float r = fract(aRnd.w * 13.7);
  // the gust: its strength varies in bands with height (streaks), plus a little per point
  float gust = 0.65 + 0.55 * fbm(vec2(n.y * 3.5, 4.2)) + 0.25 * (aRnd.y - 0.5);
  if (flake) gust *= 0.6;
  float a2 = age * age;
  vec2 p = aPos;
  p.x -= W * (0.16 * age + (gathers ? 0.42 : 0.9) * gust * a2);
  // eddies: neighbours curl up or down together, drifting with time; the gust also lifts
  float eddy = fbm(n * vec2(2.2, 3.0) + vec2(age * 0.9, 1.7));
  p.y += W * (eddy * (flake ? 0.3 : 0.2) * pow(age, 1.5) - 0.1 * a2);
  // turbulent spread grows the longer a point is airborne
  vec2 jit = (aRnd.yz - 0.5) * vec2(0.1, 0.16) * W * pow(age, 1.4);
  p += flake ? jit * 1.6 : jit;
  if (flake) p.y += W * 0.02 * (sin(aRnd.z * 6.2832 + age * 4.0) - sin(aRnd.z * 6.2832));   // flutter (none at rest)

  // gathering: a curved path (quadratic Bezier) to the same pixel of the lobby logo. The curve
  // bows the same way for every point (onward with the gust, then curling up into the panel), so
  // the swarm streams in as one; the noise varies it a little between neighbours.
  vec2 home = uDst.xy + (aPos - uBox.xy) * uDst.z;
  vec2 d = home - p;
  vec2 ctrl = (p + home) * 0.5 + vec2(d.y, -d.x) * (0.38 + 0.12 * eddy + 0.1 * (aRnd.z - 0.5));
  float h = 1.0 - g;
  if (g > 0.0) p = h * h * p + 2.0 * h * g * ctrl + g * g * home;

  float blown = clamp(age * 5.0, 0.0, 1.0) * (1.0 - g);
  float a;
  if (gathers) a = uFade * mix(1.0, flake ? 1.0 : 0.75, blown);   // airborne dust thins a little
  else {
    float life = flake ? 2.1 + 1.0 * r : 0.8 + 0.9 * r, k = age / life;
    a = k >= 1.0 ? 0.0 : (flake ? 1.0 - k * k : (1.0 - k) * (1.0 - k));
  }
  // flakes whiten while airborne, like snow
  vec3 c = mix(aCol.rgb, vec3(0.95, 0.96, 1.0), flake ? 0.6 * blown : 0.0);
  float alpha = mix(aCol.a, flake ? max(aCol.a, 0.9) : aCol.a, blown);
  vCol = vec4(c * alpha, alpha) * a;
  vRound = flake ? blown : 0.0;
  // one device pixel at rest; dust stays fine, flakes grow; settled points match the lobby logo's scale
  float settled = uPx * mix(1.0, max(uDst.z, 0.75), g);
  gl_PointSize = a > 0.0 ? mix(settled, flake ? uDpr * (2.2 + 1.6 * aRnd.y) : uPx * 1.25, blown) : 0.0;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
const FRAG = /* glsl */`#version 300 es
precision mediump float;
in vec4 vCol; in float vRound; out vec4 o;
void main() {
  // flakes are soft discs, pixels stay square
  float d = length(gl_PointCoord - 0.5);
  o = vCol * mix(1.0, 1.0 - smoothstep(0.2, 0.5, d), vRound);
}`;

interface FieldOpts { box: DOMRect; dpr: number; pointPx: number; gather: { x: number; y: number; scale: number } | null }

function createField(pos: Float32Array, col: Uint8Array, rnd: Uint8Array, count: number, o: FieldOpts) {
  const canvas = document.createElement('canvas');
  // a whole number of device pixels, shown unscaled: any resampling would soften the letters
  canvas.width = Math.floor(innerWidth * o.dpr); canvas.height = Math.floor(innerHeight * o.dpr);
  const cssW = canvas.width / o.dpr, cssH = canvas.height / o.dpr;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: `${cssW}px`, height: `${cssH}px`, zIndex: '101', pointerEvents: 'none', visibility: 'hidden' });
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const attr = (name: string, data: ArrayBufferView, size: number, type: number, norm: boolean): void => {
    const loc = gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
  };
  gl.bindVertexArray(gl.createVertexArray());
  attr('aPos', pos, 2, gl.FLOAT, false);
  attr('aCol', col, 4, gl.UNSIGNED_BYTE, true);
  attr('aRnd', rnd, 4, gl.UNSIGNED_BYTE, true);
  const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name);
  gl.uniform2f(u('uView'), cssW, cssH);
  gl.uniform4f(u('uBox'), o.box.left, o.box.top, o.box.width, o.box.height);
  const g = o.gather;
  gl.uniform4f(u('uDst'), g?.x ?? 0, g?.y ?? 0, g?.scale ?? 1, g ? 1 : 0);
  gl.uniform1f(u('uPx'), o.pointPx);
  gl.uniform1f(u('uDpr'), o.dpr);
  const uT = u('uT'), uFade = u('uFade');
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const draw = (t: number): void => {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uT, t);
    gl.uniform1f(uFade, g ? 1 - Math.min(1, Math.max(0, (t - SETTLE) / HANDOFF)) : 1);
    gl.drawArrays(gl.POINTS, 0, count);
  };
  draw(0);   // compile and upload now, not on the first frame of the exit
  document.body.appendChild(canvas);
  // gathering: settled and handed over; otherwise the last flakes (released at SWEEP) fade by then
  const END = g ? SETTLE + HANDOFF : SWEEP + 3.2;
  let disposed = false;
  return {
    canvas,
    /** `tick` gets the exit's time: negative during the fade-in lead, then seconds since the wind started. */
    run(tick: (t: number) => void, done: () => void): void {
      const t0 = performance.now();
      const frame = (now: number): void => {
        if (disposed) return;
        const t = (now - t0) / 1000 - LEAD;   // negative while fading in: at rest
        draw(Math.max(0, t));
        tick(t);
        if (t < END) requestAnimationFrame(frame); else done();
      };
      draw(0);
      requestAnimationFrame(frame);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
