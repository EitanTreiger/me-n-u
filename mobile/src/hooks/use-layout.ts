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
    /** Max width for page content. */
    contentWidth: wide ? 1200 : 720,
    /** Columns for card grids. */
    columns: width >= 1300 ? 3 : wide ? 2 : 1,
  };
}
