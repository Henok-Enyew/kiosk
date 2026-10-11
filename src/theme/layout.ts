import { useWindowDimensions } from 'react-native';
import { space } from './index';

/**
 * Screen-size info for laying out the same UI on a 360 dp phone and on 5–8"
 * terminals, in portrait and landscape. Sizes in the screens were designed for
 * a ~600 dp short side (7" terminal); `scale` shrinks or grows the large
 * display elements (clock, prompts, tiles) from that baseline.
 */
export interface Layout {
  width: number;
  height: number;
  landscape: boolean;
  /** Phone-sized: narrow portrait or a short landscape screen. */
  compact: boolean;
  scale: number;
  /** Horizontal screen padding. */
  gutter: number;
  /** Scales a design size, rounded to whole dp. */
  s: (size: number) => number;
}

const BASE_SHORT_SIDE = 600;

export function computeLayout(width: number, height: number): Layout {
  const shortSide = Math.min(width, height);
  const scale = Math.min(1.25, Math.max(0.75, shortSide / BASE_SHORT_SIDE));
  const compact = width < 480 || height < 480;
  return {
    width,
    height,
    landscape: width > height,
    compact,
    scale,
    gutter: compact ? space.lg : space.xl,
    s: size => Math.round(size * scale),
  };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return computeLayout(width, height);
}
