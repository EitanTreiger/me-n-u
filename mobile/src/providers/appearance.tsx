import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SystemUI from 'expo-system-ui';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { DarkColors, LightColors, type Palette } from '@/constants/theme';

/** What the user picked in Settings; "system" follows the phone or computer. */
export type AppearancePreference = 'system' | 'light' | 'dark';

type AppearanceState = {
  preference: AppearancePreference;
  setPreference: (p: AppearancePreference) => void;
  /** The scheme actually showing. */
  scheme: 'light' | 'dark';
  colors: Palette;
};

const PREFERENCE_KEY = 'appearance';

const AppearanceContext = createContext<AppearanceState>({
  preference: 'system',
  setPreference: () => {},
  scheme: 'light',
  colors: LightColors,
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(PREFERENCE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') setPreferenceState(stored);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<AppearanceState>(() => {
    const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return {
      preference,
      setPreference: (p) => {
        setPreferenceState(p);
        AsyncStorage.setItem(PREFERENCE_KEY, p).catch(() => {});
      },
      scheme,
      colors: scheme === 'dark' ? DarkColors : LightColors,
    };
  }, [preference, system]);

  // Paint behind the app in the theme's colour, so scrolling past the top or
  // bottom (overscroll / rubber-banding) never shows a white page underneath.
  useEffect(() => {
    const bg = value.colors.background;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      for (const el of [document.documentElement, document.body]) {
        el.style.backgroundColor = bg;
        el.style.colorScheme = value.scheme;
      }
      const root = document.getElementById('root');
      if (root) root.style.backgroundColor = bg;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    } else {
      SystemUI.setBackgroundColorAsync(bg).catch(() => {});
    }
  }, [value.colors.background, value.scheme]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

/** The active colour palette (light or dark). */
export function useColors() {
  return useContext(AppearanceContext).colors;
}

/**
 * Like StyleSheet.create, but the styles are built from the active palette:
 * `const useStyles = makeStyles((Colors) => ({ ... }))`, then `useStyles()` in
 * the component. Each palette's sheet is built once and reused.
 */
type StyleMap = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<S extends StyleMap>(build: (colors: Palette) => S & StyleMap) {
  const cache = new Map<Palette, Readonly<S>>();
  return function useStyles(): Readonly<S> {
    const colors = useColors();
    const cached = cache.get(colors);
    if (cached) return cached;
    const styles = StyleSheet.create<S>(build(colors));
    cache.set(colors, styles);
    return styles;
  };
}
