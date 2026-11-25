'use client';
import type { ReactNode } from 'react';
import { HtmlSync } from '@/components/motion/HtmlSync';
import { useIsClient } from '@/hooks/useIsClient';
import { AuthProvider } from './auth';
import { AdminLangProvider } from './lang';
import { ConfirmProvider, ToastProvider } from './ui';

/** All admin providers. Nothing renders until hydration is done (the admin has no server-rendered content, and this keeps language/theme reads hydration-safe). */
export function AdminRoot({ children }: { children: ReactNode }) {
  const ready = useIsClient();
  if (!ready) return <div className="adm-boot" aria-busy="true"><span className="spinner" /></div>;
  return (
    <AdminLangProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <HtmlSync />
            {children}
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AdminLangProvider>
  );
}
