import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AttendanceEventType } from '../config';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import type { Layout } from '../theme/layout';

const TILE_COLORS: Record<AttendanceEventType, string> = {
  CLOCK_IN: colors.clockIn,
  CLOCK_OUT: colors.clockOut,
  BREAK_START: colors.breakStart,
  BREAK_END: colors.breakEnd,
};

const GLYPHS: Record<AttendanceEventType, string> = {
  CLOCK_IN: '→',
  CLOCK_OUT: '←',
  // Drawn below: the bundled fonts have no pause symbol.
  BREAK_START: '',
  BREAK_END: '▶',
};

interface ActionTileProps {
  eventType: AttendanceEventType;
  onPress: () => void;
  highlighted?: boolean;
  disabled?: boolean;
  /** Scales the tile for small phones / large terminals. */
  layout?: Layout;
}

export function ActionTile({
  eventType,
  onPress,
  highlighted,
  disabled,
  layout,
}: ActionTileProps) {
  const color = TILE_COLORS[eventType];
  const s = layout?.s ?? ((n: number) => n);
  const glyphSize = Math.max(36, s(48));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.events[eventType]}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: color,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        {
          minHeight: Math.max(88, s(132)),
          padding: layout?.compact ? space.lg : space.xl,
        },
        highlighted && styles.highlighted,
      ]}
    >
      <View
        style={[
          styles.glyphWrap,
          { width: glyphSize, height: glyphSize, borderRadius: glyphSize / 2 },
        ]}
      >
        {eventType === 'BREAK_START' ? (
          <View style={styles.pause}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        ) : (
          <Text style={styles.glyph}>{GLYPHS[eventType]}</Text>
        )}
      </View>
      <Text
        style={[styles.label, { fontSize: Math.max(18, s(24)) }]}
        numberOfLines={2}
      >
        {strings.events[eventType]}
      </Text>
    </Pressable>
  );
}

export function eventColor(eventType: AttendanceEventType) {
  return TILE_COLORS[eventType];
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: radius.xxl + 6,
    justifyContent: 'space-between',
    gap: space.sm,
  },
  highlighted: { borderWidth: 4, borderColor: colors.foreground },
  glyphWrap: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: colors.white, fontSize: 22, fontFamily: fonts.bodyBold },
  pause: { flexDirection: 'row', gap: 5 },
  pauseBar: {
    width: 5,
    height: 18,
    borderRadius: 1,
    backgroundColor: colors.white,
  },
  label: { color: colors.white, fontSize: 24, fontFamily: fonts.heading },
});
