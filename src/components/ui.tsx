import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius, space, TOUCH_TARGET } from '../theme';
import { useLayout } from '../theme/layout';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  testID,
}: ButtonProps) {
  const palette = BUTTON_PALETTE[variant];
  const { compact } = useLayout();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            compact && styles.buttonTextCompact,
            { color: palette.text },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const BUTTON_PALETTE: Record<
  ButtonVariant,
  { background: string; pressed: string; text: string; border: string }
> = {
  primary: {
    background: colors.brand,
    pressed: colors.brandPressed,
    text: colors.white,
    border: colors.brand,
  },
  secondary: {
    background: colors.card,
    pressed: colors.muted,
    text: colors.foreground,
    border: colors.border,
  },
  ghost: {
    background: 'transparent',
    pressed: colors.muted,
    text: colors.secondaryForeground,
    border: 'transparent',
  },
  destructive: {
    background: colors.destructive,
    pressed: colors.destructivePressed,
    text: colors.white,
    border: colors.destructive,
  },
};

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { compact } = useLayout();
  return (
    <View style={[styles.card, compact && styles.cardCompact, style]}>
      {children}
    </View>
  );
}

type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.muted, fg: colors.secondaryForeground },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warningForeground },
  danger: { bg: colors.destructiveSoft, fg: colors.destructive },
  brand: { bg: colors.brandSoft, fg: colors.brand },
};

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: PillTone;
}) {
  const palette = PILL_TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: palette.fg }]} />
      <Text
        style={[styles.pillText, { color: palette.fg }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export function Title({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { compact } = useLayout();
  return (
    <Text style={[styles.title, compact && styles.titleCompact, style]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Avatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
        {initials || '?'}
      </Text>
    </View>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={styles.rowValue} numberOfLines={2}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { paddingHorizontal: space.lg, minHeight: 56 },
  buttonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    textAlign: 'center',
  },
  buttonTextCompact: { fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
  },
  cardCompact: { padding: space.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 6,
    flexShrink: 1,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: fonts.bodySemiBold, fontSize: 13, flexShrink: 1 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.foreground,
    flexShrink: 1,
  },
  titleCompact: { fontSize: 22 },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.mutedForeground,
  },
  avatar: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.headingBold, color: colors.brand },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.lg,
  },
  rowLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.mutedForeground,
  },
  rowValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.foreground,
    flexShrink: 1,
    textAlign: 'right',
  },
});
