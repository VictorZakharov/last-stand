// The loading screen's exit: a gust from the right blows the logo away to the left as snow-like
// particles. The logo (SVG) is snapshotted to pixels and every pixel becomes a point, so at rest
// the particle field is the logo exactly and it can take the SVG's place invisibly. The motion
// is closed-form in the vertex shader: hundreds of thousands of points, no per-frame CPU work.

const SWEEP = 1.1;                 // s for the wind front to cross the letters, right to left
const MAX_POINTS = 600_000;        // above this the snapshot is sampled every other pixel
const PAD_X = 0.3, PAD_Y = 0.4;    // the glow reaches this far outside the letters' box (fractions)

export interface LogoBlow { start(done: () => void): void }

/** Snapshot `logo` (a .logo-art element) into a particle field, ready to be blown away. */
export async function prepareBlow(logo: HTMLElement): Promise<LogoBlow | null> {
  const box = logo.getBoundingClientRect();
  if (box.width < 10) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // snapshot area: the letters' box plus the glow around it, in device pixels
  const area = { x: box.left - box.width * PAD_X, y: box.top - box.height * PAD_Y, w: box.width * (1 + 2 * PAD_X), h: box.height * (1 + 2 * PAD_Y) };
  const pw = Math.round(area.w * dpr), ph = Math.round(area.h * dpr);
  const px = await snapshot(logo, pw, ph);
  if (!px) return null;

  let lit = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 6) lit++;
  const step = lit > MAX_POINTS ? 2 : 1;
  const n = Math.ceil(lit / (step * step)) + 16;
  const pos = new Float32Array(n * 2), col = new Uint8Array(n * 4), rnd = new Uint8Array(n * 4);
  let c = 0;
  for (let y = 0; y < ph; y += step) for (let x = 0; x < pw; x += step) {
    const o = (y * pw + x) * 4;
    if (px[o + 3] <= 6 || c >= n) continue;
    // pixel centre in CSS px
    pos[c * 2] = area.x + (x + step / 2) / dpr;
    pos[c * 2 + 1] = area.y + (y + step / 2) / dpr;
    col.set(px.subarray(o, o + 4), c * 4);
    for (let k = 0; k < 4; k++) rnd[c * 4 + k] = Math.random() * 256;
    c++;
  }
  const field = createField(pos, col, rnd, c, { box, dpr, pointPx: step });
  if (!field) return null;
  return {
    start(done) {
      field.canvas.style.visibility = 'visible';
      logo.style.visibility = 'hidden';   // the particles are the logo now
      field.run(() => { field.dispose(); done(); });
    },
  };
}

/** Render the logo SVG (with its font embedded, which an SVG image can't load) to RGBA pixels. */
async function snapshot(logo: HTMLElement, w: number, h: number): Promise<Uint8ClampedArray | null> {
  const defs = document.querySelector('.svg-defs defs');
  const layers = [...logo.querySelectorAll('svg')];
  if (!defs || !layers.length) return null;
  const vb = layers[0].viewBox.baseVal;
  const view = `${vb.x - vb.width * PAD_X} ${vb.y - vb.height * PAD_Y} ${vb.width * (1 + 2 * PAD_X)} ${vb.height * (1 + 2 * PAD_Y)}`;
  const font = await fontFace('Cinzel', 900).catch(() => '');
  const xml = new XMLSerializer();
  const body = layers.map((s) => s.innerHTML).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view}">`
    + `<style>${font}</style>${xml.serializeToString(defs)}${body}</svg>`;
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
uniform float uT, uPx, uDpr; uniform vec2 uView; uniform vec4 uBox;   // box: letters' left, top, width, height (CSS px)
out vec4 vCol; out float vRound;
const float SWEEP = ${SWEEP.toFixed(2)}, TEAR = 0.07, OVER = 1.07;
// the front is torn: how far it lags at height v (0..1)
float tear(float v) { return TEAR * (0.5 + 0.25 * sin(v * 23.1 + 1.3) + 0.15 * sin(v * 57.7) + 0.1 * sin(v * 131.9 + 4.0)); }
void main() {
  vec2 n = (aPos - uBox.xy) / uBox.zw;
  float rel = max(0.0, (1.0 - n.x + tear(clamp(n.y, 0.0, 1.0))) / OVER * SWEEP - aRnd.x * 0.08);
  float age = max(0.0, uT - rel), W = uBox.z;
  // most pixels become fine dust that streams off fast; a few become snowflakes that drift and flutter
  bool flake = aRnd.w > 0.92;
  float r = fract(aRnd.w * 13.7);
  float life = flake ? 2.0 + 1.0 * r : 0.55 + 0.8 * r, k = age / life;
  float ph = aRnd.z * 6.2832;
  vec2 p = aPos;
  if (flake) {
    // each flake catches the wind differently, so the flurry spreads out instead of moving as a block
    p.x += -W * (0.05 + 0.45 * aRnd.y) * age - W * (0.25 + 0.6 * r) * age * age;
    p.y += W * (-0.3 + 0.45 * aRnd.z) * age * (0.5 + 0.5 * age) + W * 0.035 * (cos(ph) - cos(ph + 3.5 * age));
  } else {
    p.x += -W * (0.25 + 0.55 * aRnd.y) * age - 1.3 * W * age * age;
    p.y += W * (-0.3 + 0.5 * aRnd.z) * age * (0.6 + age) + W * 0.012 * (cos(ph) - cos(ph + 7.0 * age));
  }
  float a = k >= 1.0 ? 0.0 : (flake ? 1.0 - k * k : (1.0 - k) * (1.0 - k));
  float blown = clamp(age * 5.0, 0.0, 1.0);
  // flakes whiten as they leave, like snow
  vec3 c = mix(aCol.rgb, vec3(0.95, 0.96, 1.0), flake ? 0.6 * blown : 0.0);
  float alpha = mix(aCol.a, flake ? max(aCol.a, 0.9) : aCol.a, blown);
  vCol = vec4(c * alpha, alpha) * a;
  vRound = flake ? blown : 0.0;
  // a pixel at rest; blown dust stays fine, flakes grow
  gl_PointSize = a > 0.0 ? mix(uPx, flake ? uDpr * (2.2 + 1.6 * aRnd.y) : uPx * 1.25, blown) : 0.0;
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

interface FieldOpts { box: DOMRect; dpr: number; pointPx: number }

function createField(pos: Float32Array, col: Uint8Array, rnd: Uint8Array, count: number, o: FieldOpts) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(innerWidth * o.dpr); canvas.height = Math.round(innerHeight * o.dpr);
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '101', pointerEvents: 'none', visibility: 'hidden' });
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
  gl.uniform2f(u('uView'), innerWidth, innerHeight);
  gl.uniform4f(u('uBox'), o.box.left, o.box.top, o.box.width, o.box.height);
  gl.uniform1f(u('uPx'), o.pointPx);
  gl.uniform1f(u('uDpr'), o.dpr);
  const uT = u('uT');
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const draw = (t: number): void => {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uT, t);
    gl.drawArrays(gl.POINTS, 0, count);
  };
  draw(0);   // compile and upload now, not on the first frame of the exit
  document.body.appendChild(canvas);
  // the last flakes (released at SWEEP plus jitter) live up to 2.4 s
  const END = SWEEP + 0.1 + 2.4;
  return {
    canvas,
    run(done: () => void): void {
      const t0 = performance.now();
      const frame = (now: number): void => {
        const t = (now - t0) / 1000;
        draw(t);
        if (t < END) requestAnimationFrame(frame); else done();
      };
      draw(0);
      requestAnimationFrame(frame);
    },
    dispose(): void {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
