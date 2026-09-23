import * as THREE from 'three';
import {
  CRIMSON_CAPE_PALETTE,
  type CapeFabricPalette,
} from '../physics/CapeAppearance';
import { periodicFbm } from '../utils/random';

export interface SurfaceTextures {
  readonly color: THREE.DataTexture;
  readonly height: THREE.DataTexture;
  readonly normal: THREE.DataTexture;
  readonly roughness: THREE.DataTexture;
}

function textureFromBytes(
  data: Uint8Array,
  size: number,
  colorSpace: THREE.ColorSpace = THREE.NoColorSpace,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function writePixel(target: Uint8Array, index: number, r: number, g: number, b: number): void {
  target[index] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
  target[index + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
  target[index + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
  target[index + 3] = 255;
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const normalized = THREE.MathUtils.clamp(
    (value - minimum) / (maximum - minimum),
    0,
    1,
  );
  return normalized * normalized * (3 - 2 * normalized);
}

export function createRockTextures(size = 512): SurfaceTextures {
  const color = new Uint8Array(size * size * 4);
  const height = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const period = 8;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / size) * period;
      const ny = (y / size) * period;
      const broad = periodicFbm(nx, ny, period, 0x51a7);
      const pores = periodicFbm(nx * 3, ny * 3, period * 3, 0xc43e);
      const strata = Math.sin((nx + broad * 0.9) * 3.1 + Math.sin(ny * 1.8)) * 0.5 + 0.5;
      heights[y * size + x] = THREE.MathUtils.clamp(broad * 0.68 + pores * 0.2 + strata * 0.12, 0, 1);
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size + x) * 4;
      const sample = (sx: number, sy: number): number => {
        const px = (sx + size) % size;
        const py = (sy + size) % size;
        return heights[py * size + px] ?? 0;
      };
      const value = sample(x, y);
      const mineral = Math.max(0, periodicFbm((x / size) * 24, (y / size) * 24, 24, 0x19ca) - 0.62);
      const warm = Math.pow(value, 1.7);
      writePixel(color, pixel, 25 + warm * 29 + mineral * 48, 31 + warm * 31 + mineral * 24, 31 + warm * 27 + mineral * 12);
      writePixel(height, pixel, value * 255, value * 255, value * 255);
      const dx = sample(x - 1, y) - sample(x + 1, y);
      const dy = sample(x, y - 1) - sample(x, y + 1);
      const normalVector = new THREE.Vector3(dx * 3.7, dy * 3.7, 1).normalize();
      writePixel(normal, pixel, (normalVector.x * 0.5 + 0.5) * 255, (normalVector.y * 0.5 + 0.5) * 255, normalVector.z * 255);
      const rough = 205 + (1 - value) * 34 + mineral * 24;
      writePixel(roughness, pixel, rough, rough, rough);
    }
  }

  return {
    color: textureFromBytes(color, size, THREE.SRGBColorSpace),
    height: textureFromBytes(height, size),
    normal: textureFromBytes(normal, size),
    roughness: textureFromBytes(roughness, size),
  };
}

export function createCapeFabricTextures(
  size = 256,
  palette: CapeFabricPalette = CRIMSON_CAPE_PALETTE,
): Pick<SurfaceTextures, 'color' | 'normal' | 'roughness'> {
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const threadX = Math.pow(Math.max(0, Math.sin((x / size) * Math.PI * 64)), 8);
      const threadY = Math.pow(Math.max(0, Math.sin((y / size) * Math.PI * 72)), 8);
      const noise = periodicFbm((x / size) * 8, (y / size) * 8, 8, 0xa11c);
      const weave = threadX * 0.52 + threadY * 0.48;
      const shade = 0.76 + noise * 0.24 + weave * 0.13;
      const ageVariation = 0.92 + periodicFbm((x / size) * 3, (y / size) * 3, 3, 0x71f4) * 0.08;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const sideTrim = 1 - smoothstep(0.018, 0.052, Math.min(u, 1 - u));
      const hemTrim = 1 - smoothstep(0.018, 0.052, v);
      const trim = Math.max(sideTrim, hemTrim) * 0.72;
      const fabricRed = palette.fabric[0] * shade * ageVariation;
      const fabricGreen = palette.fabric[1] * shade;
      const fabricBlue = palette.fabric[2] * shade;
      writePixel(
        color,
        index,
        THREE.MathUtils.lerp(fabricRed, palette.trim[0], trim),
        THREE.MathUtils.lerp(fabricGreen, palette.trim[1], trim),
        THREE.MathUtils.lerp(fabricBlue, palette.trim[2], trim),
      );
      writePixel(normal, index, 128 + (threadX - threadY) * 18, 128 + (threadY - threadX) * 18, 249);
      const rough = 188 + noise * 35 - weave * 18;
      writePixel(roughness, index, rough, rough, rough);
    }
  }

  return {
    color: textureFromBytes(color, size, THREE.SRGBColorSpace),
    normal: textureFromBytes(normal, size),
    roughness: textureFromBytes(roughness, size),
  };
}

export function configureTextureFiltering(textures: SurfaceTextures, anisotropy: number): void {
  for (const texture of Object.values(textures)) {
    texture.anisotropy = anisotropy;
  }
}
