import React, {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { KioskService } from './kioskService';

const KioskContext = createContext<KioskService | null>(null);

export function KioskProvider({
  service,
  children,
}: {
  service: KioskService;
  children: ReactNode;
}) {
  return (
    <KioskContext.Provider value={service}>{children}</KioskContext.Provider>
  );
}

export function useKiosk(): KioskService {
  const service = useContext(KioskContext);
  if (!service) throw new Error('useKiosk must be used inside KioskProvider');
  return service;
}

export function useKioskData() {
  const { store } = useKiosk();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
