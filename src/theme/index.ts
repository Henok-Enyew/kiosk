/**
 * Rona design tokens for the kiosk, taken from the web platform's light theme
 * (rona-erp/apps/client/src/app/globals.css). The brand palette comes from the
 * Rona brand book: deep-teal primary, aqua accents, mist canvas.
 */
export const palette = {
  ink: '#1C1A1B',
  deep: '#1D3536',
  teal: '#386163',
  sea: '#518985',
  aqua: '#6EC3C7',
  mint: '#85D0C4',
  pale: '#C9DCDA',
  green: '#03AF68',
  mist: '#F2F3FA',
} as const;

export const colors = {
  brand: palette.teal,
  brandPressed: palette.deep,
  brandSoft: '#E3F1F0',
  ring: palette.aqua,

  background: palette.mist,
  card: '#FFFFFF',
  foreground: '#1A2B2E',
  secondaryForeground: palette.deep,
  muted: '#EEF1F3',
  mutedForeground: '#5B6B6E',
  border: '#DDE4E6',

  destructive: '#E7000B',
  destructivePressed: '#C10007',
  destructiveSoft: '#FEF2F2',
  success: '#009966',
  successSoft: '#ECFDF5',
  warning: '#FE9A00',
  warningForeground: '#BB4D00',
  warningSoft: '#FFFBEB',

  // Attendance actions — same colors as the web kiosk.
  clockIn: '#009966',
  clockOut: '#EC003F',
  breakStart: '#FE9A00',
  breakEnd: '#0084D1',

  // Camera surroundings: the brand book's dark teal surfaces.
  night: '#111718',
  nightCard: '#172124',
  nightMuted: '#9AADAF',
  scrim: 'rgba(17,23,24,0.6)',
  scan: palette.aqua,

  white: '#FFFFFF',
} as const;

/**
 * Brand surface behind the terminal and pairing screens (web `--brand-surface-accent`).
 * The wave line art from assets/images/rona-waves.webp sits on top of it.
 */
export const brandSurface = `radial-gradient(120% 90% at 100% 0%, #CFE6E4 0%, transparent 55%), linear-gradient(110deg, #F4F5FB 0%, #EEF3F5 40%, #E2EFEE 70%, #D6E8E6 100%)`;

/** Thin accent bar along the top of the brand screens. */
export const brandAccentBar = `linear-gradient(to right, ${palette.teal}, ${palette.aqua}, ${palette.green})`;

/**
 * Brand typography: Quicksand headings, Inter body (the open stand-in for the
 * brand's Helvetica; the device system font can't be trusted on terminals),
 * JetBrains Mono for figures. Bundled in android/app/src/main/assets/fonts
 * (file name = family).
 */
export const fonts = {
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemiBold: 'Inter-SemiBold',
  bodyBold: 'Inter-Bold',
  heading: 'Quicksand-SemiBold',
  headingBold: 'Quicksand-Bold',
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
  monoBold: 'JetBrainsMono-Bold',
} as const;

/** Platform radius 0.5rem = 8, scaled ×0.6/0.8/1/1.4/1.8. */
export const radius = {
  sm: 5,
  md: 6,
  lg: 8,
  xl: 11,
  xxl: 14,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Minimum touch target on the terminal (gloves, distance). */
export const TOUCH_TARGET = 64;
