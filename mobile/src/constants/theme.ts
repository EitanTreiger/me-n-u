/**
 * Design tokens. Flat colours only, no gradients.
 * #B9D1BD is the brand sage. It is light, so text placed on it uses `onPrimary`.
 */
export const Colors = {
  primary: '#B9D1BD',
  primarySoft: '#E8F0E9',
  primaryStrong: '#4E6E56', // sage dark enough for text and icons on white
  onPrimary: '#1E2B22',

  background: '#F7F8F7',
  surface: '#FFFFFF',
  border: '#E3E8E4',
  borderStrong: '#CCD5CE',

  text: '#1E2B22',
  textSecondary: '#5D6B62',
  textMuted: '#8A968E',

  success: '#3F7A4F',
  warning: '#9A6B1F',
  warningSoft: '#F6EEDD',
  danger: '#B4443B',
  dangerSoft: '#F7E4E2',
  star: '#C99A2E',
} as const;

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

export const Type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4, color: Colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2, color: Colors.text },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: Colors.text },
  body: { fontSize: 15, lineHeight: 22, color: Colors.text },
  small: { fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6, color: Colors.textSecondary, textTransform: 'uppercase' as const },
};

export const MaxContentWidth = 720;
