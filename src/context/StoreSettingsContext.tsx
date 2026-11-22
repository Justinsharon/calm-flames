/**
 * Realtime `settings/store`. Unset / invalid fields mean the dependent feature is hidden:
 * no shipping config -> no free-shipping messaging and no shipping quote; no COD config -> no
 * cash-on-delivery option; no build-a-box config -> no build-a-box.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  parseStoreSettings,
  getShippingConfig,
  getCodConfig,
  getBuildABoxConfig,
  type StoreSettings,
  type ShippingConfig,
  type CodConfig,
  type BuildABoxSettings
} from '../lib/storeSettings';

interface StoreSettingsContextType {
  settings: StoreSettings;
  loading: boolean;
  shipping: ShippingConfig | null;
  cod: CodConfig | null;
  buildABox: BuildABoxSettings | null;
}

const StoreSettingsContext = createContext<StoreSettingsContextType>({
  settings: {},
  loading: true,
  shipping: null,
  cod: null,
  buildABox: null
});

export const StoreSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<StoreSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'store'),
      (snap) => {
        setSettings(parseStoreSettings(snap.exists() ? snap.data() : {}));
        setLoading(false);
      },
      (err) => {
        console.warn('Could not load store settings; shipping/COD features stay hidden:', err);
        setSettings({});
        setLoading(false);
      }
    );
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loading,
      shipping: getShippingConfig(settings),
      cod: getCodConfig(settings),
      buildABox: getBuildABoxConfig(settings)
    }),
    [settings, loading]
  );
  return <StoreSettingsContext.Provider value={value}>{children}</StoreSettingsContext.Provider>;
};

export function useStoreSettings(): StoreSettingsContextType {
  return useContext(StoreSettingsContext);
}
