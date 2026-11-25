/**
 * The mist layer of the Nature background: WebGL shader first, CSS mist when the GPU is not available or is taken away.
 * A tiny fake browser (elements, a WebGL context that records what it is asked to do) stands in for the real one.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAtmosphere, type Atmosphere } from '@/lib/nature/atmosphere';
import type { MistMode, NatureProfile } from '@/lib/nature/quality';
import type { Ticker } from '@/lib/nature/ticker';

/* ───────────── a very small fake browser ───────────── */
type Listener = (event: { type: string; preventDefault(): void; defaultPrevented: boolean }) => void;

class FakeElement {
  className = '';
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  styleProps: Record<string, string> = {};
  style = { setProperty: (name: string, value: string) => void (this.styleProps[name] = value) };
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  width = 300;
  height = 150;
  private listeners = new Map<string, Set<Listener>>();
  constructor(readonly tag: string) {}
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  prepend(node: FakeElement): void {
    node.remove();
    node.parent = this;
    this.children.unshift(node);
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  addEventListener(type: string, fn: Listener): void {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  /** Fires the event the way a browser does; returns whether a listener called preventDefault(). */
  dispatch(type: string): boolean {
    const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
    return event.defaultPrevented;
  }
  getContext(): unknown {
    return glBehavior();
  }
  find(cls: string): FakeElement | undefined {
    return this.children.find((c) => c.className === cls);
  }
}

/** A WebGL context that accepts everything and writes down the calls the tests care about. */
function fakeGl(calls: string[], over: Record<string, unknown> = {}): unknown {
  const lose = { loseContext: () => calls.push('loseContext') };
  const known: Record<string, unknown> = {
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getExtension: (name: string) => (name === 'WEBGL_lose_context' ? lose : null),
    drawArrays: () => calls.push('draw'),
    ...over
  };
  return new Proxy({}, { get: (_t, prop: string) => (prop in known ? known[prop] : /^[A-Z][A-Z_0-9]*$/.test(prop) ? 1 : () => ({})) });
}

let glBehavior: () => unknown;
const fakeWindowListeners = new Set<string>();
const saved: Record<string, unknown> = {};
const GLOBALS = ['document', 'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener'];

beforeEach(() => {
  for (const key of GLOBALS) saved[key] = (globalThis as Record<string, unknown>)[key];
  fakeWindowListeners.clear();
  Object.assign(globalThis, {
    document: { createElement: (tag: string) => new FakeElement(tag) },
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (type: string) => void fakeWindowListeners.add(type),
    removeEventListener: (type: string) => void fakeWindowListeners.delete(type)
  });
});
afterEach(() => {
  for (const key of GLOBALS) {
    if (saved[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = saved[key];
  }
});

/* ───────────── fakes for the two things the layer is handed ───────────── */
interface Task {
  id: string;
  fn: (now: number, dt: number) => boolean | void;
  wakes: number;
  removed: boolean;
}
function setup(opts: { mist?: MistMode; motion?: boolean } = {}) {
  const tasks: Task[] = [];
  const logs: string[] = [];
  const ticker = {
    add: (id: string, fn: Task['fn']) => {
      const task: Task = { id, fn, wakes: 0, removed: false };
      tasks.push(task);
      return { wake: () => void (task.wakes += 1), remove: () => void (task.removed = true) };
    },
    pause() {}, resume() {}, destroy() {}
  } as unknown as Ticker;
  const state = { mist: opts.mist ?? 'webgl', motion: opts.motion ?? true };
  const profile = { constrained: false, mistMode: () => state.mist, motion: () => state.motion, log: (...a: unknown[]) => void logs.push(a.join(' ')) } as unknown as NatureProfile;
  const host = new FakeElement('div');
  const atmosphere = createAtmosphere({ host: host as unknown as HTMLElement, ticker, profile });
  const root = host.children[0];
  return { atmosphere, host, root, canvas: root.find('atmos__gl'), tasks, logs, state };
}
const frame = (task: Task): boolean | void => task.fn(1000, 16);

describe('WebGL mist', () => {
  test('starts as a shader mist: a canvas on top of the CSS layers, listening for context loss', () => {
    const calls: string[] = [];
    glBehavior = () => fakeGl(calls);
    const { atmosphere, root, canvas, tasks } = setup();
    assert.equal(atmosphere.mode, 'webgl');
    assert.equal(root.dataset.mist, 'webgl');
    assert.equal(root.attributes['aria-hidden'], 'true', 'decoration only: hidden from screen readers');
    assert.ok(canvas && root.children[0] === canvas, 'the canvas is the first layer');
    assert.equal(canvas.listenerCount('webglcontextlost'), 1);
    assert.equal(tasks.length, 1);
    assert.ok(tasks[0].wakes > 0, 'the first frame is requested');
    frame(tasks[0]);
    assert.ok(calls.includes('draw'));
  });

  test('when the GPU takes the context away it carries on with the CSS mist — no error, no blank screen', () => {
    const calls: string[] = [];
    glBehavior = () => fakeGl(calls);
    const { atmosphere, root, canvas, tasks, logs } = setup();
    assert.ok(canvas);
    const prevented = canvas.dispatch('webglcontextlost');
    assert.equal(prevented, true, 'preventDefault() tells the browser the page handles it');
    assert.equal(atmosphere.mode, 'css');
    assert.equal(root.dataset.mist, 'css', 'the CSS stylesheet shows its drifting gradients for this value');
    assert.equal(canvas.parent, null, 'the dead canvas is taken out of the page');
    assert.ok(logs.some((l) => /context lost/i.test(l)));
    const drawsBefore = calls.filter((c) => c === 'draw').length;
    assert.equal(frame(tasks[0]), false, 'the frame loop goes to sleep');
    assert.equal(calls.filter((c) => c === 'draw').length, drawsBefore, 'nothing is drawn on a lost context');
    assert.doesNotThrow(() => {
      atmosphere.setBlend({ veil: [0, 0, 0], rgb: [10, 20, 30], amount: 0.5, rays: 0, live: 0 });
      atmosphere.setAnimated(false);
      atmosphere.setAnimated(true);
    });
    assert.equal(root.styleProps['--mist'], '10,20,30', 'the CSS mist still follows the scene colours');
  });

  test('a second loss event, or one after destroy(), does nothing harmful', () => {
    glBehavior = () => fakeGl([]);
    const { atmosphere, canvas } = setup();
    assert.ok(canvas);
    canvas.dispatch('webglcontextlost');
    assert.doesNotThrow(() => canvas.dispatch('webglcontextlost'));
    atmosphere.destroy();
    assert.doesNotThrow(() => canvas.dispatch('webglcontextlost'));
  });

  test('if mist is switched off by the device profile, a lost context leaves no mist at all', () => {
    glBehavior = () => fakeGl([]);
    const { atmosphere, root, canvas, state } = setup();
    state.mist = 'none';
    canvas?.dispatch('webglcontextlost');
    assert.equal(atmosphere.mode, 'none');
    assert.equal(root.dataset.mist, 'none');
  });
});

describe('when WebGL is not available at all', () => {
  const cases: [string, () => unknown][] = [
    ['getContext returns nothing', () => null],
    ['getContext throws', () => { throw new Error('no GPU'); }],
    ['the shader does not compile', () => fakeGl([], { getShaderParameter: () => false })],
    ['the program does not link', () => fakeGl([], { getProgramParameter: () => false })]
  ];
  for (const [name, behavior] of cases) {
    test(`${name}: the CSS mist is used from the start`, () => {
      glBehavior = behavior;
      const { atmosphere, root, canvas } = setup();
      assert.equal(atmosphere.mode, 'css');
      assert.equal(root.dataset.mist, 'css');
      assert.equal(canvas, undefined, 'no canvas is added');
    });
  }

  test('a device profile that asks for CSS (or nothing) never touches WebGL', () => {
    let asked = 0;
    glBehavior = () => { asked += 1; return fakeGl([]); };
    for (const mist of ['css', 'none'] as MistMode[]) {
      const { atmosphere, canvas } = setup({ mist });
      assert.equal(atmosphere.mode, mist);
      assert.equal(canvas, undefined);
    }
    assert.equal(asked, 0);
  });
});

describe('motion and clean-up', () => {
  test('reduced motion: one still frame, no animation loop; turning motion back on wakes the loop', () => {
    glBehavior = () => fakeGl([]);
    const { atmosphere, host, tasks } = setup({ motion: false });
    assert.equal(host.dataset.motion, 'off');
    assert.equal(frame(tasks[0]), false, 'a static page draws once and sleeps');
    const wakes = tasks[0].wakes;
    atmosphere.setAnimated(true);
    assert.equal(host.dataset.motion, 'on');
    assert.ok(tasks[0].wakes > wakes);
    assert.equal(frame(tasks[0]), true, 'animating: keep asking for frames');
  });

  test('destroy() gives everything back: the GPU context, the listeners, the frame task and the page elements', () => {
    const calls: string[] = [];
    glBehavior = () => fakeGl(calls);
    const { atmosphere, host, root, canvas, tasks } = setup();
    assert.ok(canvas && fakeWindowListeners.has('resize'));
    atmosphere.destroy();
    assert.ok(calls.includes('loseContext'), 'the GPU context is handed back at once, not left to garbage collection');
    assert.equal(canvas.listenerCount('webglcontextlost'), 0);
    assert.equal(fakeWindowListeners.has('resize'), false);
    assert.equal(tasks[0].removed, true);
    assert.equal(root.parent, null, 'the layer is removed from the page');
    assert.equal(host.dataset.motion, undefined);
    assert.doesNotThrow(() => atmosphere.destroy(), 'destroying twice is harmless');
  });

  test('destroy() works even when handing the context back fails (it was already lost)', () => {
    glBehavior = () => fakeGl([], { getExtension: () => { throw new Error('context lost'); } });
    const { atmosphere } = setup();
    assert.doesNotThrow(() => atmosphere.destroy());
  });

  test('destroy() after a context loss does not touch the dead context again', () => {
    const calls: string[] = [];
    glBehavior = () => fakeGl(calls);
    const { atmosphere, canvas } = setup();
    canvas?.dispatch('webglcontextlost');
    atmosphere.destroy();
    assert.ok(!calls.includes('loseContext'));
  });
});

export type { Atmosphere };
