/**
 * Restrained pointer parallax + warm cursor light (fine pointers only). It never touches a layer directly: it eases
 * the pointer to two numbers, --px / --py (−1…1), published on the #scenes host. Every layer carries a --depth and one
 * CSS rule turns that into a transform, so far layers drift slowly and near ones move more. The loop sleeps once settled.
 */
import type { NatureProfile } from './quality';
import type { Ticker } from './ticker';

export interface Parallax {
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

export function createParallax({ host, ticker, profile }: { host: HTMLElement; ticker: Ticker; profile: NatureProfile }): Parallax {
  let on = false;
  let present = false;
  let tx = 0, ty = 0; // target, −1…1
  let x = 0, y = 0; // eased
  let lx = 0, ly = 0; // cursor light target (px)
  let cx = 0, cy = 0; // cursor light eased (px)
  const atmos = (): Element | null => host.querySelector('.atmos');

  const task = ticker.add('parallax', (_now, dt) => {
    const k = 1 - Math.exp(-dt / 150); // ~150 ms time-constant: smooth, never snappy
    const kl = 1 - Math.exp(-dt / 90);
    x += (tx - x) * k;
    y += (ty - y) * k;
    cx += (lx - cx) * kl;
    cy += (ly - cy) * kl;
    host.style.setProperty('--px', x.toFixed(4));
    host.style.setProperty('--py', y.toFixed(4));
    host.style.setProperty('--lx', `${cx.toFixed(1)}px`);
    host.style.setProperty('--ly', `${cy.toFixed(1)}px`);
    return Math.abs(tx - x) > 0.0008 || Math.abs(ty - y) > 0.0008 || Math.abs(lx - cx) > 0.3 || Math.abs(ly - cy) > 0.3;
  });

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    tx = (e.clientX / innerWidth) * 2 - 1;
    ty = (e.clientY / innerHeight) * 2 - 1;
    lx = e.clientX;
    ly = e.clientY;
    if (!present) {
      present = true;
      cx = lx;
      cy = ly;
      atmos()?.classList.add('has-pointer');
    }
    task.wake();
  };
  const onLeave = (): void => {
    tx = 0;
    ty = 0;
    present = false;
    atmos()?.classList.remove('has-pointer');
    task.wake();
  };

  function setEnabled(enabled: boolean): void {
    if (enabled === on) return;
    on = enabled;
    if (on) {
      addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      addEventListener('blur', onLeave);
    } else {
      removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      removeEventListener('blur', onLeave);
      onLeave(); // ease the layers back to centre
    }
  }
  setEnabled(profile.parallax());
  return {
    setEnabled,
    destroy() {
      setEnabled(false);
      task.remove();
    }
  };
}
