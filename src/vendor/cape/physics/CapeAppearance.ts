export interface CapeFabricPalette {
  readonly fabric: readonly [number, number, number];
  readonly trim: readonly [number, number, number];
  readonly sheenColor: number;
  readonly attachmentColor: number;
  readonly materialName: string;
}

export const CRIMSON_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [148, 10, 19] as const,
  trim: [158, 73, 28] as const,
  sheenColor: 0x6f0713,
  attachmentColor: 0x940a13,
  materialName: 'Woven crimson cape',
});

export const BOT_CYAN_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [12, 132, 148] as const,
  trim: [82, 218, 222] as const,
  sheenColor: 0x075d69,
  attachmentColor: 0x0c8494,
  materialName: 'Woven cyan bot cape',
});
