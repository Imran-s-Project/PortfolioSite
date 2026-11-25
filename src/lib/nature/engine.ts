/**
 * Entry point of the Cinematic Nature Background Engine.
 * Wires four small modules around ONE shared animation ticker:
 *   quality.ts (what this device / connection / preference allows) · scene-manager.ts (scene stack, scroll → crossfade, video
 *   life-cycle, posters, fallbacks) · atmosphere.ts (mist, god-rays, cursor light, grain) · parallax.ts (pointer parallax).
 * It is loaded with a dynamic import after the page has rendered, so it can never delay or break the portfolio itself.
 * Media is described by /nature/manifest.json (written by tools/make-nature-assets.mjs). A missing or broken manifest
 * simply means "no footage": scenes use their calm gradient fallback.
 */
import { SCENES } from '@/data/scenes';
import { subscribeMotion } from '@/lib/motion-pref';
import { createAtmosphere, type Atmosphere } from './atmosphere';
import { createParallax } from './parallax';
import { createProfile, type NatureProfile } from './quality';
import { createSceneManager, type SceneManager } from './scene-manager';
import { createTicker } from './ticker';
import type { NatureManifest } from './types';

export const MANIFEST_PATH = '/nature/manifest.json';

async function loadManifest(url: string, profile: NatureProfile): Promise<NatureManifest> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object' || typeof (data as NatureManifest).scenes !== 'object' || (data as NatureManifest).scenes === null) throw new Error('unexpected shape');
    return data as NatureManifest;
  } catch (err) {
    profile.log('manifest unavailable → fallback scenes', err instanceof Error ? err.message : err);
    return { version: 1, scenes: {} };
  } finally {
    clearTimeout(timer);
  }
}

export interface NatureEngine {
  profile: NatureProfile;
  manager: SceneManager;
  atmosphere: Atmosphere;
  /** Call after the page layout changed (route change, content loaded). */
  remeasure(): void;
  destroy(): void;
}

export async function initNature(host: HTMLElement, veil: HTMLElement | null, signal?: AbortSignal): Promise<NatureEngine | null> {
  const profile = createProfile();
  const manifestUrl = new URL(MANIFEST_PATH, location.origin).href;
  const manifest = await loadManifest(manifestUrl, profile);
  if (signal?.aborted) return null; // the component unmounted while the manifest was loading

  const ticker = createTicker();
  const atmosphere = createAtmosphere({ host, ticker, profile });
  const manager = createSceneManager({ host, ticker, profile, config: SCENES, manifest, manifestUrl, veil, onBlend: atmosphere.setBlend });
  const parallax = createParallax({ host, ticker, profile });

  // The header button / OS setting can turn ambient motion on or off at any time.
  const offMotion = subscribeMotion(() => {
    atmosphere.setAnimated(profile.motion());
    parallax.setEnabled(profile.parallax());
    manager.refresh();
  });
  host.dataset.engine = 'ready';
  profile.log('ready', { mist: atmosphere.mode, mode: host.dataset.mode, constrained: profile.constrained });

  const api: NatureEngine = {
    profile,
    manager,
    atmosphere,
    remeasure: () => manager.remeasure(),
    destroy() {
      offMotion();
      parallax.destroy();
      manager.destroy();
      atmosphere.destroy();
      ticker.destroy();
      delete host.dataset.engine;
    }
  };
  return api;
}
