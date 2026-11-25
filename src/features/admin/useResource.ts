'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data for an admin screen: one request per question, the newest answer wins, and React never has to re-render
 * synchronously from inside an effect (state is only written when the promise settles).
 *
 * - `fetcher` MUST be stable — define it at module level, or wrap it in `useCallback` with the values it depends on.
 *   A new `fetcher` is a new question: older answers are dropped and the screen shows its loading state again.
 * - `reload()` asks the same question again (Retry button, or after saving/deleting). The previous data stays visible
 *   until the fresh data arrives, so tables do not flash empty.
 * - An answer that arrives after the screen has moved on (unmount, new fetcher, newer reload) is ignored.
 * - React StrictMode runs effects twice in development; the in-flight request is reused, so only ONE request is sent.
 */
export interface Resource<T> {
  /** The loaded value. `null` until the first successful load, and after a failed one. */
  data: T | null;
  /** A request for the current question is in flight. */
  loading: boolean;
  /** The latest request failed (shown with a Retry button). */
  failed: boolean;
  /** Ask again. */
  reload: () => void;
  /** Change the loaded value locally (e.g. drop a row that was just deleted). Does nothing before the first load. */
  update: (change: (current: T) => T) => void;
}

interface Settled<T> {
  fetcher: () => Promise<T>;
  attempt: number;
  data: T | null;
  failed: boolean;
}
interface InFlight<T> {
  fetcher: () => Promise<T>;
  attempt: number;
  promise: Promise<T>;
}

export function useResource<T>(fetcher: () => Promise<T>): Resource<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const inFlight = useRef<InFlight<T> | null>(null);

  useEffect(() => {
    let current = inFlight.current;
    if (!current || current.fetcher !== fetcher || current.attempt !== attempt) {
      // `new Promise` turns a synchronous throw inside the fetcher into a normal rejection.
      current = { fetcher, attempt, promise: new Promise<T>((resolve) => resolve(fetcher())) };
      inFlight.current = current;
    }
    let ignore = false;
    current.promise.then(
      (data) => {
        if (!ignore) setSettled({ fetcher, attempt, data, failed: false });
      },
      () => {
        if (!ignore) setSettled({ fetcher, attempt, data: null, failed: true });
      }
    );
    return () => {
      ignore = true;
    };
  }, [fetcher, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const update = useCallback((change: (current: T) => T) => {
    setSettled((prev) => (prev && !prev.failed && prev.data !== null ? { ...prev, data: change(prev.data) } : prev));
  }, []);

  const sameQuestion = settled !== null && settled.fetcher === fetcher;
  const latest = sameQuestion && settled.attempt === attempt;
  return {
    data: sameQuestion ? settled.data : null,
    loading: !latest,
    failed: latest && settled.failed,
    reload,
    update
  };
}
