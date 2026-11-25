import scenes from './legacy/scenes.json';
import type { Localized } from '@/types';

/** Design config of the six cinematic scenes (hero · projects · about · skills · contact · footer) — unchanged from the legacy engine. */
export interface SceneConfig {
  id: string;
  category: string;
  title: Localized;
  brief: string;
  tint: string;
  gradient: string;
  sun: { x: number; y: number; r: number; rgb: string; a: number };
  /** readability veil strength at the top / middle / bottom of the screen */
  veil: [number, number, number];
  mist: { amount: number; tint: string; rays: number };
}
export const SCENES = scenes as unknown as SceneConfig[];
export type SceneId = 'hero' | 'valley' | 'forest' | 'river' | 'lake' | 'blue-hour';
