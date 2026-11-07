import { useWindowDimensions } from 'react-native';

/**
 * Phone vs computer layout. "wide" screens (tablets in landscape, laptops,
 * desktops) get a sidebar, multi-column grids and two-column pages.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return {
    width,
    wide,
    /** Max width for page content (a comfortable reading width on big screens). */
    contentWidth: wide ? 1000 : 720,
    /** Columns for the menu's day grid: two on computers, one on phones. */
    columns: wide ? 2 : 1,
  };
}
