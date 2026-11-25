/**
 * The scroll-driven heart of the Cinematic Nature Engine.
 *  • one full-screen scene per `data-scene` element on the page, cross-faded by scroll (both directions)
 *  • the life-cycle of every <video>: lazy create, preload the next scene, play only what is visible, pause when the tab
 *    is hidden, unload what is far away, never exceed the decoder budget
 *  • graceful degradation: poster → fallback gradient, autoplay blocked, source failure, frame-rate guard
 * Layer cake per scene (back → front):  .scene › .scene__stage › .scene__layer--media › [.scene__fallback, img.scene__poster, video.scene__video]
 */
import type { SceneConfig } from '@/data/scenes';
import type { Blend, ManifestScene, NatureManifest, Rgb } from './types';
import { TIERS, type NatureProfile } from './quality';
import type { Ticker } from './ticker';

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
};

const SOURCES = [['webm', 'video/webm'], ['mp4', 'video/mp4']] as const;
const GRACE_MS = 3600; // keep a just-left video alive this long (scroll back and forth without thrashing)

const fallbackCss = (c: SceneConfig): string => {
  const { x, y, r, rgb: col, a } = c.sun;
  return `radial-gradient(${r}% ${Math.round(r * 0.8)}% at ${x}% ${y}%,rgba(${col},${a}),transparent 70%),${c.gradient}`;
};

/** Largest available tier that does not exceed `want` (an index into TIERS); else the smallest above it. */
export function bestKey(available: string[], want: number): string | null {
  const idx = available
    .map((k) => (TIERS as readonly string[]).indexOf(k))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (!idx.length) return null;
  const below = idx.filter((i) => i <= want);
  return TIERS[below.length ? (below[below.length - 1] as number) : (idx[0] as number)] ?? null;
}

type SceneState = '' | 'fallback' | 'poster' | 'still' | 'loading' | 'playing' | 'failed';
interface VideoHandle { el: HTMLVideoElement; key: string; failedSources: number; total: number }
interface Scene {
  id: string;
  cfg: SceneConfig;
  media: Record<string, { webm?: string; mp4?: string }> | null;
  posters: Record<string, string>;
  mistRgb: Rgb;
  rank: number; top: number; bottom: number; weight: number;
  visible: boolean; failed: boolean; ready: boolean; live: boolean; wantPlay: boolean;
  idleSince: number;
  posterKey: string;
  badPosters: Set<string>;
  state: SceneState;
  v: VideoHandle | null;
  q: { dropped: number; total: number } | null;
  el: HTMLDivElement; stage: HTMLDivElement; base: HTMLDivElement; poster: HTMLImageElement;
  extra: HTMLImageElement[];
}
type FrameCallbackVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
type PriorityImage = HTMLImageElement & { fetchPriority?: string };

export interface SceneManager {
  scenes: Map<string, Scene>;
  refresh(): void;
  remeasure(): void;
  destroy(): void;
}

export interface SceneManagerOptions {
  host: HTMLElement;
  ticker: Ticker;
  profile: NatureProfile;
  config: SceneConfig[];
  manifest: NatureManifest | null;
  manifestUrl: string;
  veil: HTMLElement | null;
  onBlend?: (b: Blend) => void;
}

export function createSceneManager({ host, ticker, profile, config, manifest, manifestUrl, veil, onBlend }: SceneManagerOptions): SceneManager {
  const scenes = new Map<string, Scene>();
  const cleanups: (() => void)[] = [];
  let ordered: { scene: Scene; top: number; bottom: number }[] = []; // in document order
  let docHeight = 1;
  let vw = innerWidth;
  let vh = innerHeight;
  let curL = 0;
  let destroyed = false;
  let graceTimer = 0, trailTimer = 0, guardTimer = 0;
  let lastSync = 0;
  let lastSig = '';
  let blendDirty = false;
  let gestureArmed = false;
  let badSamples = 0;

  const url = (rel: string): string => new URL(rel, manifestUrl).href;
  const listen = <K extends keyof WindowEventMap>(target: Window | Document, type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions): void => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
    void (0 as unknown as K);
  };
  const setState = (sc: Scene, state: SceneState): void => {
    if (sc.state === state) return;
    sc.state = state;
    sc.el.dataset.state = state;
  };

  /* ───────────────────────── build the scene stack ───────────────────────── */
  for (const cfg of config) {
    const m: ManifestScene = manifest?.scenes?.[cfg.id] ?? {};
    const media = m.video && Object.keys(m.video).some((k) => (TIERS as readonly string[]).includes(k)) ? m.video : null;
    const el = make('div', 'scene');
    el.dataset.for = cfg.id;
    el.style.setProperty('--tint', m.tint ?? cfg.tint);
    const stage = make('div', 'scene__stage');
    const base = make('div', 'scene__layer scene__layer--media');
    base.style.setProperty('--depth', '0.35');
    const fb = make('div', 'scene__fallback');
    fb.style.background = fallbackCss(cfg);
    const poster = make('img', 'scene__poster');
    poster.alt = '';
    poster.decoding = 'async';
    poster.draggable = false;
    poster.setAttribute('aria-hidden', 'true');
    base.append(fb, poster);
    stage.append(base);

    const sc: Scene = {
      id: cfg.id, cfg, media, posters: m.posters ?? {}, mistRgb: rgb(cfg.mist.tint),
      rank: -1, top: 0, bottom: 0, weight: 0,
      visible: false, failed: false, ready: false, live: false, wantPlay: false,
      idleSince: 0, posterKey: '', badPosters: new Set(), state: '', v: null, q: null,
      el, stage, base, poster, extra: []
    };
    poster.addEventListener('load', () => {
      poster.classList.add('is-loaded');
      if (!sc.live && !sc.v && !sc.failed) setState(sc, profile.videoAllowed() && sc.media ? 'poster' : sc.media ? 'still' : 'poster');
    });
    poster.addEventListener('error', () => {
      // Remember the broken file so it is never requested again; the next-best tier (if any) is tried instead.
      if (sc.posterKey) sc.badPosters.add(sc.posterKey);
      poster.removeAttribute('src');
      poster.classList.remove('is-loaded');
      sc.posterKey = '';
    });
    // Optional parallax layers (transparent PNG/WebP): manifest.scenes.<id>.layers = [{ src, depth }]
    sc.extra = (m.layers ?? [])
      .filter((l) => l && l.src)
      .map((l) => {
        const img = make('img', 'scene__layer scene__layer--extra');
        img.alt = '';
        img.decoding = 'async';
        img.setAttribute('aria-hidden', 'true');
        img.style.setProperty('--depth', String(clamp(Number(l.depth) || 0.7, 0.1, 1.4)));
        img.dataset.src = url(l.src);
        img.addEventListener('load', () => img.classList.add('is-loaded'));
        img.addEventListener('error', () => {
          img.dataset.src = ''; // do not request a broken layer again on the next sync
          img.remove();
        });
        stage.append(img);
        return img;
      });
    el.append(stage);
    host.append(el);
    setState(sc, 'fallback');
    scenes.set(cfg.id, sc);
  }
  const anyMedia = [...scenes.values()].some((s) => s.media);

  /* ───────────────────────── tiers & posters ───────────────────────── */
  const portraitView = (): boolean => vw < 820 && vh > vw * 1.15; // a phone held upright
  function wantedTier(ignoreCap = false): number {
    let want: number;
    if (portraitView() && profile.constrained) want = 0;
    else {
      const px = vw * Math.min(devicePixelRatio || 1, profile.constrained ? 1.25 : 2);
      want = px <= 1300 ? 1 : px <= 2050 ? 2 : 3;
    }
    return ignoreCap ? want : Math.min(want, profile.tierCap());
  }
  function loadPoster(sc: Scene): void {
    const keys = Object.keys(sc.posters).filter((k) => (TIERS as readonly string[]).includes(k) && !sc.badPosters.has(k));
    if (keys.length) {
      const key = bestKey(keys, wantedTier(true));
      const file = key ? sc.posters[key] : undefined;
      if (key && file && key !== sc.posterKey) {
        sc.posterKey = key;
        if (sc.rank === 0) (sc.poster as PriorityImage).fetchPriority = 'high';
        sc.poster.src = url(file);
      }
    }
    for (const img of sc.extra) if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
  }

  /* ───────────────────────── video life-cycle ───────────────────────── */
  function armGesture(): void {
    if (gestureArmed) return;
    gestureArmed = true;
    const events = ['pointerdown', 'touchend', 'keydown', 'click'];
    const retry = (): void => {
      gestureArmed = false;
      for (const t of events) removeEventListener(t, retry, true);
      for (const sc of scenes.values()) if (sc.v && sc.wantPlay) playScene(sc);
    };
    for (const t of events) addEventListener(t, retry, { capture: true, passive: true });
  }
  function reveal(sc: Scene, v: VideoHandle): void {
    const show = (): void => {
      if (sc.v !== v) return;
      v.el.classList.add('is-live');
      sc.live = true;
      blendDirty = true;
      setState(sc, 'playing');
      task.wake();
    };
    const el = v.el as FrameCallbackVideo;
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(show);
    else show();
  }
  function fail(sc: Scene, why: string): void {
    profile.log('scene failed → fallback', sc.id, why);
    sc.failed = true;
    unloadVideo(sc);
    setState(sc, 'failed');
  }
  function ensureVideo(sc: Scene): boolean {
    if (!sc.media || sc.failed) return false;
    const key = bestKey(Object.keys(sc.media), wantedTier());
    if (!key) return false;
    if (sc.v && sc.v.key !== key && !sc.visible) unloadVideo(sc); // a better/cheaper tier is wanted and nobody is looking
    if (sc.v) return true;
    const files = sc.media[key] ?? {};
    const el = make('video', 'scene__video');
    el.muted = true;
    el.defaultMuted = true;
    el.loop = true;
    el.playsInline = true;
    el.autoplay = false;
    el.controls = false;
    el.preload = 'auto';
    el.disablePictureInPicture = true;
    el.disableRemotePlayback = true;
    el.tabIndex = -1;
    for (const [attr, val] of [['muted', ''], ['playsinline', ''], ['webkit-playsinline', ''], ['aria-hidden', 'true']] as const) el.setAttribute(attr, val);
    // No `poster` attribute on purpose: the <video> stays transparent until its first frame is on screen,
    // and the scene's own <img> poster underneath is what the visitor sees meanwhile (one request, one code path).
    const v: VideoHandle = { el, key, failedSources: 0, total: 0 };
    for (const [ext, type] of SOURCES) {
      const file = files[ext];
      if (!file) continue;
      const src = make('source');
      src.type = type;
      src.src = url(file);
      src.addEventListener('error', () => {
        if (sc.v === v && ++v.failedSources >= v.total) fail(sc, 'no playable source');
      });
      el.append(src);
      v.total++;
    }
    if (!v.total) return false;
    sc.v = v;
    sc.ready = false;
    sc.live = false;
    el.addEventListener('error', () => {
      if (sc.v === v) fail(sc, 'media error');
    });
    el.addEventListener('loadeddata', () => {
      if (sc.v !== v) return;
      sc.ready = true;
      if (sc.wantPlay) playScene(sc);
    });
    el.addEventListener('playing', () => {
      if (sc.v === v) reveal(sc, v);
    });
    sc.base.append(el);
    setState(sc, 'loading');
    profile.log('load', sc.id, key);
    return true;
  }
  function playScene(sc: Scene): void {
    const v = sc.v;
    sc.wantPlay = true;
    if (!v || !v.el.paused) return;
    const p = v.el.play();
    if (p && p.catch) {
      p.catch((err: unknown) => {
        if (sc.v !== v) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError') {
          profile.log('autoplay blocked — waiting for a gesture');
          armGesture();
        } else if (name !== 'AbortError') fail(sc, name || 'play failed');
      });
    }
  }
  function pauseScene(sc: Scene): void {
    sc.wantPlay = false;
    const v = sc.v;
    if (v && !v.el.paused) v.el.pause();
  }
  function unloadVideo(sc: Scene): void {
    const v = sc.v;
    if (!v) return;
    sc.v = null;
    sc.ready = false;
    if (sc.live) {
      sc.live = false;
      blendDirty = true;
    }
    const el = v.el;
    try {
      el.pause();
      el.removeAttribute('src');
      el.querySelectorAll('source').forEach((s) => s.remove());
      el.load(); // releases the decoder and aborts any download
    } catch {
      /* element already gone */
    }
    el.remove();
    profile.log('unload', sc.id);
    if (!sc.failed) setState(sc, sc.poster.classList.contains('is-loaded') ? 'poster' : 'fallback');
  }
  const centerOf = (sc: Scene): number => (sc.top + sc.bottom) / 2;

  function syncMedia(): void {
    if (destroyed) return;
    clearTimeout(graceTimer);
    const now = performance.now();
    lastSync = now;
    const have = [...scenes.values()].filter((s) => s.media && !s.failed);
    host.dataset.mode = !anyMedia ? 'fallback' : profile.videoAllowed() ? 'video' : 'still';
    if (!profile.videoAllowed()) {
      // posters / still frames only: free every decoder and buffer
      for (const sc of scenes.values()) {
        if (sc.v) unloadVideo(sc);
        sc.wantPlay = false;
        if (sc.media && !sc.failed) setState(sc, sc.poster.classList.contains('is-loaded') ? 'still' : 'fallback');
      }
      return;
    }
    if (document.hidden) {
      for (const sc of scenes.values()) pauseScene(sc);
      return;
    }
    const visible = ordered.map((a) => a.scene).filter((s) => s.visible);
    const play = new Set(visible.filter((s) => s.media && !s.failed).sort((a, b) => b.weight - a.weight).slice(0, profile.maxPlaying));
    const warm = new Set<Scene>();
    if (visible.length) {
      const lo = Math.min(...visible.map((s) => s.rank));
      const hi = Math.max(...visible.map((s) => s.rank));
      const next = ordered[hi + 1]?.scene;
      const prev = ordered[lo - 1]?.scene;
      const first = ordered[lo]?.scene;
      if (next && next.top - curL < vh * 2.2) warm.add(next);
      if (prev && first && !profile.constrained && curL - first.top < vh * 1.2) warm.add(prev);
    }
    for (const sc of [...play, ...warm]) loadPoster(sc);
    let lingering = false;
    for (const sc of have) {
      if (play.has(sc)) {
        sc.idleSince = 0;
        if (ensureVideo(sc)) playScene(sc);
      } else if (warm.has(sc)) {
        sc.idleSince = 0;
        if (ensureVideo(sc)) pauseScene(sc);
      } else if (sc.v) {
        pauseScene(sc);
        if (!sc.idleSince) sc.idleSince = now;
        if (now - sc.idleSince > GRACE_MS) unloadVideo(sc);
        else lingering = true;
      }
    }
    // Hard ceiling on simultaneously alive videos (memory + decoders).
    const alive = have.filter((s) => s.v);
    if (alive.length > profile.maxAlive) {
      alive
        .filter((s) => !play.has(s))
        .sort((a, b) => Math.abs(centerOf(b) - curL) - Math.abs(centerOf(a) - curL))
        .slice(0, alive.length - profile.maxAlive)
        .forEach(unloadVideo);
    }
    if (lingering) graceTimer = window.setTimeout(syncMedia, GRACE_MS / 2);
  }

  /* ───────────────────────── layout → scroll mapping ───────────────────────── */
  function measure(): void {
    if (destroyed) return;
    vw = innerWidth;
    vh = innerHeight;
    docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, vh);
    const sy = scrollY;
    const found: { scene: Scene; top: number; bottom: number }[] = [];
    document.querySelectorAll<HTMLElement>('[data-scene]').forEach((node) => {
      const sc = scenes.get(node.dataset.scene ?? '');
      if (!sc || found.some((f) => f.scene === sc)) return;
      const r = node.getBoundingClientRect();
      if (r.height > 0) found.push({ scene: sc, top: r.top + sy, bottom: r.bottom + sy });
    });
    found.sort((a, b) => a.top - b.top);
    ordered = found;
    for (const sc of scenes.values()) sc.rank = -1;
    found.forEach((a, i) => {
      a.scene.rank = i;
      a.scene.top = a.top;
      a.scene.bottom = found[i + 1] ? (found[i + 1] as { top: number }).top : docHeight;
      a.scene.el.style.zIndex = String(i + 1);
    });
    task.wake();
  }

  function apply(): void {
    if (destroyed) return;
    const n = ordered.length;
    if (!n) return;
    const y = scrollY;
    const p = clamp(y / Math.max(1, docHeight - vh), 0, 1);
    // The reading line sits a little above mid-screen at the top of the page and slides to the very bottom edge at the
    // end, so the last scene (footer) can always reach full strength.
    const L = y + vh * (0.4 + 0.6 * p * p);
    curL = L;
    const W = clamp(vh * 0.7, 280, 720);
    const moving = profile.motion();
    const s = ordered.map((a, i) => (i === 0 ? 1 : smooth((L - (a.top - W / 2)) / W)));
    const acc = { veil: [0, 0, 0] as Rgb, amount: 0, rays: 0, live: 0, rgb: [0, 0, 0] as Rgb };
    let visChanged = false;
    for (let i = 0; i < n; i++) {
      const sc = (ordered[i] as { scene: Scene }).scene;
      const si = s[i] as number;
      const next = i + 1 < n ? (s[i + 1] as number) : 0;
      const w = si - next; // the share of the picture this scene currently owns
      const vis = si > 0.002 && next < 0.998;
      if (vis !== sc.visible) {
        sc.visible = vis;
        visChanged = true;
        sc.el.classList.toggle('is-active', vis);
        if (vis) loadPoster(sc);
      }
      sc.weight = w;
      if (vis) {
        // Later scenes sit on top and fade IN over the earlier one, which stays opaque underneath:
        // no brightness dip mid-crossfade, and scrolling back simply fades the top scene away.
        sc.el.style.opacity = (i === 0 ? 1 : si).toFixed(3);
        // Subtle dolly: the arriving scene settles from 5% larger, the departing one drifts 4.5% closer.
        sc.stage.style.transform = moving ? `scale(${(1 + (1 - si) * 0.05 + next * 0.045).toFixed(4)})` : '';
        sc.el.style.setProperty('--sy', clamp((L - centerOf(sc)) / vh, -1.5, 1.5).toFixed(3));
      }
      if (w > 0.0005) {
        const c = sc.cfg;
        for (let k = 0; k < 3; k++) {
          acc.veil[k] = (acc.veil[k] as number) + (c.veil[k] as number) * w;
          acc.rgb[k] = (acc.rgb[k] as number) + (sc.mistRgb[k] as number) * w;
        }
        acc.amount += c.mist.amount * w;
        acc.rays += c.mist.rays * w;
        acc.live += (sc.live ? 1 : 0) * w;
      }
    }
    const sig = [...acc.veil, acc.amount, acc.rays, acc.live, ...acc.rgb].map((x) => x.toFixed(3)).join('|');
    if (sig !== lastSig || blendDirty) {
      lastSig = sig;
      blendDirty = false;
      if (veil) {
        veil.style.setProperty('--veil-t', acc.veil[0].toFixed(3));
        veil.style.setProperty('--veil-m', acc.veil[1].toFixed(3));
        veil.style.setProperty('--veil-b', acc.veil[2].toFixed(3));
      }
      onBlend?.(acc);
    }
    const now = performance.now();
    if (visChanged || now - lastSync > 300) syncMedia();
    clearTimeout(trailTimer);
    trailTimer = window.setTimeout(syncMedia, 340); // evaluate once more when scrolling settles
  }

  const task = ticker.add('scenes', () => {
    apply();
    return false;
  });

  /* ───────────────────────── frame-rate guard ───────────────────────── */
  function sampleQuality(): void {
    if (document.hidden || destroyed || profile.force === 'high') return; // ?nature=high: QA mode, never step down
    let worst = 0;
    let worstTier = 0;
    for (const sc of scenes.values()) {
      const el = sc.v?.el;
      if (!sc.v || !el || el.paused || !el.getVideoPlaybackQuality) continue;
      const q = el.getVideoPlaybackQuality();
      const prev = sc.q ?? { dropped: 0, total: 0 };
      const dd = q.droppedVideoFrames - prev.dropped;
      const dt = q.totalVideoFrames - prev.total;
      sc.q = { dropped: q.droppedVideoFrames, total: q.totalVideoFrames };
      if (dt >= 30 && dd / dt > worst) {
        worst = dd / dt;
        worstTier = Math.max(0, (TIERS as readonly string[]).indexOf(sc.v.key));
      }
    }
    badSamples = worst > 0.3 ? badSamples + 1 : Math.max(0, badSamples - 1);
    if (badSamples >= 2) {
      badSamples = 0;
      // Step ONE tier down from what is stuttering. Below the smallest tier that suits this screen
      // (portrait crop for an upright phone, otherwise 720p) the answer is posters only.
      const next = worstTier - 1;
      const cap = profile.capAt(next >= (portraitView() ? 0 : 1) ? next : -1);
      profile.log('playback stutters → quality step down, cap', cap);
      for (const sc of scenes.values()) {
        sc.q = null;
        if (sc.v) unloadVideo(sc);
      }
      syncMedia();
    }
  }

  /* ───────────────────────── wiring ───────────────────────── */
  let resizeTimer = 0;
  listen(window, 'scroll', () => task.wake(), { passive: true });
  listen(window, 'resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      measure();
      for (const sc of scenes.values()) if (sc.visible) loadPoster(sc);
      syncMedia();
    }, 160);
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) ticker.pause();
    else ticker.resume();
    syncMedia();
    task.wake();
  });
  listen(window, 'pageshow', ((e: PageTransitionEvent) => {
    if (e.persisted) {
      syncMedia();
      task.wake();
    }
  }) as EventListener); // back/forward cache

  let roQueued = false;
  const ro = new ResizeObserver(() => {
    if (roQueued) return;
    roQueued = true;
    requestAnimationFrame(() => {
      roQueued = false;
      measure();
    });
  });
  ro.observe(document.body);
  void document.fonts?.ready.then(measure);
  guardTimer = window.setInterval(sampleQuality, 2500);
  measure();
  apply();
  syncMedia();

  return {
    scenes,
    refresh() {
      for (const sc of scenes.values()) if (sc.visible) loadPoster(sc);
      syncMedia();
      task.wake();
    },
    remeasure: measure,
    destroy() {
      destroyed = true;
      clearTimeout(graceTimer);
      clearTimeout(trailTimer);
      clearTimeout(resizeTimer);
      clearInterval(guardTimer);
      ro.disconnect();
      cleanups.forEach((fn) => fn());
      for (const sc of scenes.values()) {
        unloadVideo(sc);
        sc.el.remove();
      }
      scenes.clear();
      delete host.dataset.mode;
    }
  };
}
