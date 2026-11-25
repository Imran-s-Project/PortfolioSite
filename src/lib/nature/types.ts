export type Rgb = [number, number, number];
export interface ManifestScene {
  tint?: string;
  posters?: Record<string, string>;
  video?: Record<string, { webm?: string; mp4?: string }>;
  layers?: { src: string; depth?: number }[];
}
export interface NatureManifest {
  version?: number;
  scenes: Record<string, ManifestScene>;
}
/** The weighted mix of the scenes currently on screen — drives the veil and the mist. */
export interface Blend {
  veil: Rgb;
  amount: number;
  rays: number;
  live: number;
  rgb: Rgb;
}
