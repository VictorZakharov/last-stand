// The canvas's pixels every `step`th each way, picked out on the GPU and read back alone (page/screenCells.ts): the
// whole canvas read back every frame was 70% of a `cast` (a 1920 by 1080 frame's 8 MB, 7.6 ms a read). Exact: the
// canvas is copied as it is, each pixel fetched by its whole coordinates and written back to 8 bits as it came, so
// the bytes are the canvas's own. Drawn by WebGL of its own beside three's, three's state reset after it, so three
// compiles no program for it (a program compiled after loading fails a `cast`).
import { G } from '../../../src/state';

const VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D canvasCopy;
uniform int step;
out vec4 colour;
void main() {
  colour = texelFetch(canvasCopy, ivec2(gl_FragCoord.xy) * step, 0);
}`;

/** The pixels picked out: `width` by `height` of them, bottom row first, 4 bytes each. */
export interface Sampled {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/** What the picking draws with, made once a page. */
interface Picker {
  program: WebGLProgram;
  stepAt: WebGLUniformLocation;
  canvasCopy: WebGLTexture;
  picked: WebGLTexture;
  target: WebGLFramebuffer;
  /** the picked texture's size, made again when it changes */
  width: number;
  height: number;
}

let picker: Picker | null = null;
let bytes = new Uint8Array(0);

/** A shader of `type` compiled from `source`, throwing with its log if it won't. */
function compiled(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`lab: sampledPixels: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** The picker's program, textures and target. */
function pickerOf(gl: WebGL2RenderingContext): Picker {
  const program = gl.createProgram()!;
  gl.attachShader(program, compiled(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compiled(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`lab: sampledPixels: ${gl.getProgramInfoLog(program)}`);
  }
  return {
    program,
    stepAt: gl.getUniformLocation(program, 'step')!,
    canvasCopy: gl.createTexture()!,
    picked: gl.createTexture()!,
    target: gl.createFramebuffer()!,
    width: 0,
    height: 0,
  };
}

/** `texture` bound, read whole pixels at a time. */
function bindNearest(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

/** The picked texture and its target sized `width` by `height`. */
function sizePicked(gl: WebGL2RenderingContext, own: Picker, width: number, height: number): void {
  if (own.width === width && own.height === height) return;
  bindNearest(gl, own.picked);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, own.target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, own.picked, 0);
  own.width = width;
  own.height = height;
}

/**
 * The canvas as last drawn, its pixels every `step`th each way from its bottom left (x and y 0, `step`, 2 `step`...),
 * their colour as `readPixels` of the whole canvas gives it (their alpha 255). Read it in the frame it was drawn in:
 * the canvas is cleared after.
 */
export function sampledPixels(step: number): Sampled {
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  picker ??= pickerOf(gl);
  const own = picker;
  const canvasWidth = gl.drawingBufferWidth;
  const canvasHeight = gl.drawingBufferHeight;
  const width = Math.ceil(canvasWidth / step);
  const height = Math.ceil(canvasHeight / step);
  try {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    bindNearest(gl, own.canvasCopy);
    // (its colour alone: the canvas has no alpha of its own, and a copy asking for one is refused)
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 0, 0, canvasWidth, canvasHeight, 0);
    sizePicked(gl, own, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, own.target);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(null);
    gl.useProgram(own.program);
    gl.uniform1i(own.stepAt, step);
    bindNearest(gl, own.canvasCopy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (bytes.length !== width * height * 4) bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  } finally {
    G.renderer.resetState();
  }
  return { pixels: bytes, width, height };
}
