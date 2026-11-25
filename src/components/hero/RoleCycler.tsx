'use client';
import { useEffect, useState } from 'react';
import { useMotionEnabled } from '@/hooks/useMotion';

/** The animated professional title: cross-fades between a few focus areas. Static (first role) when motion is paused or reduced. */
export function RoleCycler({ roles, label }: { roles: string[]; label: string }) {
  const [index, setIndex] = useState(0);
  const motion = useMotionEnabled();

  useEffect(() => {
    if (!motion || roles.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % roles.length), 3200);
    return () => clearInterval(id);
  }, [motion, roles.length]);

  return (
    <p className="hero__role">
      <span className="sr-only">{`${label}: ${roles.join(', ')}`}</span>
      {roles.map((role, i) => (
        <span key={role} aria-hidden="true" data-on={i === (motion ? index : 0)}>
          {role}
        </span>
      ))}
    </p>
  );
}
