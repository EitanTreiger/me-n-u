import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens. Flat colours only, no gradients.
 * #B9D1BD is the brand sage. It is light, so text placed on it uses `onPrimary`.
 * Components read the active palette with `useColors()` / `makeStyles()` from
 * `@/providers/appearance`, so Light and Dark switch live.
 */
export const LightColors = {
  primary: '#B9D1BD',
  primarySoft: '#E8F0E9',
  primaryStrong: '#4E6E56', // sage dark enough for text and icons on white
  onPrimary: '#1E2B22',

  background: '#F7F8F7',
  surface: '#FFFFFF',
  border: '#E3E8E4',
  borderStrong: '#CCD5CE',
  backdrop: 'rgba(30,43,34,0.12)',

  text: '#1E2B22',
  textSecondary: '#5D6B62',
  textMuted: '#8A968E',

  success: '#3F7A4F',
  warning: '#9A6B1F',
  warningSoft: '#F6EEDD',
  danger: '#B4443B',
  dangerSoft: '#F7E4E2',
  star: '#C99A2E',
};

export type Palette = typeof LightColors;

/** Same sage brand on a dark green-grey; `primaryStrong` flips to a light sage for text and icons. */
export const DarkColors: Palette = {
  primary: '#B9D1BD',
  primarySoft: '#26332A',
  primaryStrong: '#A8C7AE',
  onPrimary: '#1E2B22',

  background: '#121614',
  surface: '#1B201D',
  border: '#2C342F',
  borderStrong: '#3F4943',
  backdrop: 'rgba(0,0,0,0.45)',

  text: '#E6ECE7',
  textSecondary: '#A9B5AD',
  textMuted: '#7D8A81',

  success: '#7DBA8C',
  warning: '#D9A84E',
  warningSoft: '#3A3020',
  danger: '#E8776D',
  dangerSoft: '#3B2422',
  star: '#D9AE45',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typeStyles = (c: Palette) => ({
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4, color: c.text },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2, color: c.text },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: c.text },
  body: { fontSize: 15, lineHeight: 22, color: c.text },
  small: { fontSize: 13, lineHeight: 18, color: c.textSecondary },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, color: c.textSecondary, textTransform: 'uppercase' as const },
});

export type TypeVariant = keyof ReturnType<typeof typeStyles>;

export const MaxContentWidth = 720;

/**
 * Text boxes on the web otherwise use the browser's own font and a black
 * focus outline; this matches them to the rest of the app.
 */
export const InputText = (
  Platform.OS === 'web'
    ? {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        outlineStyle: 'none',
        outlineWidth: 0,
      }
    : {}
) as TextStyle;
