import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space } from '../theme';
import { useLayout } from '../theme/layout';
import { strings } from '../i18n/strings';
import { Pill } from './ui';

interface HeaderProps {
  organizationName: string;
  kioskName: string;
  online: boolean;
  queued: number;
  /** Hidden staff gesture: taps on the Rona logo. */
  onLogoPress?: () => void;
}

export function Header({
  organizationName,
  kioskName,
  online,
  queued,
  onLogoPress,
}: HeaderProps) {
  const now = useNow(1000);
  const layout = useLayout();
  // Short screens (phone in landscape): one compact row, no date line.
  const short = layout.height < 480;
  const logoSize = layout.compact ? 44 : 56;
  const logo = { width: logoSize, height: logoSize };
  const status = (
    <View style={[styles.status, short && styles.statusShort]}>
      {queued > 0 ? (
        <Pill tone="warning" label={strings.idle.queued(queued)} />
      ) : null}
      <Pill
        tone={online ? 'success' : 'danger'}
        label={online ? strings.common.online : strings.common.offline}
      />
    </View>
  );
  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: layout.gutter,
          paddingTop: short ? space.sm : layout.compact ? space.md : space.lg,
          paddingBottom: short ? space.xs : space.md,
          gap: layout.compact ? space.md : space.lg,
        },
      ]}
    >
      <Pressable
        onPress={onLogoPress}
        style={styles.brand}
        accessibilityLabel={strings.appName}
      >
        <Image
          source={require('../../assets/images/rona-icon.png')}
          style={[styles.logo, logo]}
          resizeMode="contain"
        />
        <View style={styles.brandText}>
          <Text
            style={[styles.org, layout.compact && styles.orgCompact]}
            numberOfLines={1}
          >
            {organizationName}
          </Text>
          <Text style={styles.kiosk} numberOfLines={1}>
            {kioskName}
          </Text>
        </View>
      </Pressable>
      <View style={[styles.right, short && styles.rightShort]}>
        {short ? status : null}
        <Text
          style={[
            styles.time,
            {
              fontSize: layout.s(44),
              lineHeight: Math.round(layout.s(44) * 1.15),
            },
          ]}
        >
          {formatTime(now)}
        </Text>
        {short ? null : (
          <>
            <Text style={styles.date} numberOfLines={1}>
              {formatDate(now)}
            </Text>
            {status}
          </>
        )}
      </View>
    </View>
  );
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => n.toString().padStart(2, '0');

export function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatDate(date: Date) {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${
    MONTHS[date.getMonth()]
  } ${date.getFullYear()}`;
}

export function formatDateTime(iso: string | undefined | null) {
  if (!iso) return strings.common.never;
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${formatTime(date)}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flexShrink: 1,
  },
  logo: { borderRadius: radius.xl },
  brandText: { flexShrink: 1 },
  org: { fontFamily: fonts.heading, fontSize: 20, color: colors.foreground },
  orgCompact: { fontSize: 17 },
  kiosk: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  right: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '55%' },
  rightShort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    maxWidth: '65%',
  },
  time: {
    fontFamily: fonts.monoBold,
    color: colors.foreground,
    letterSpacing: -1,
  },
  date: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  status: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.sm,
  },
  statusShort: { marginTop: 0, flexShrink: 1 },
});
