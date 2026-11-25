import type { ReactNode } from 'react';
import { AdminGate } from '@/features/admin/AdminShell';

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
