import React, { useState, useSyncExternalStore } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useKioskData } from '../app/context';
import { simController, type SimRequest } from '../hardware/sim/simController';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import { useLayout } from '../theme/layout';

/**
 * Developer panel (dev flavor only): plays the role of the biometric hardware.
 * Pick who the "camera" or "sensor" recognises, or make it fail.
 */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const sim = useSyncExternalStore(
    simController.subscribe,
    simController.getSnapshot,
  );
  const { roster } = useKioskData();
  const layout = useLayout();
  const name = (id: string) => roster[id]?.fullName ?? id.slice(0, 8);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open ? (
        <View
          style={[
            styles.panel,
            {
              width: Math.min(360, layout.width - 2 * space.sm),
              maxHeight: Math.min(520, layout.height * 0.7),
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{strings.dev.title}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.muted}>{strings.dev.intro}</Text>
            {sim.pending.length === 0 ? (
              <Text style={styles.label}>{strings.dev.noScan}</Text>
            ) : null}
            {sim.pending.map(request => (
              <PendingRequest
                key={request.id}
                request={request}
                enrolled={sim.enrolled[request.kind]}
                name={name}
              />
            ))}
            <View style={styles.switchRow}>
              <Text style={styles.label}>{strings.dev.failNextEnroll}</Text>
              <Switch
                value={sim.failNextEnroll}
                onValueChange={value => simController.setFailNextEnroll(value)}
              />
            </View>
            <Text style={styles.muted}>
              {strings.dev.enrolled(
                sim.enrolled.FACE.length,
                sim.enrolled.FINGER.length,
              )}
            </Text>
            <View style={styles.legend}>
              {strings.dev.legend.map(line => (
                <Text key={line} style={styles.muted}>
                  {line}
                </Text>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
      <Pressable style={styles.fab} onPress={() => setOpen(v => !v)}>
        <Text style={styles.fabText}>
          DEV{sim.pending.length ? ` · ${sim.pending.length}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

function PendingRequest({
  request,
  enrolled,
  name,
}: {
  request: SimRequest;
  enrolled: string[];
  name: (id: string) => string;
}) {
  const candidates = request.candidateEmployeeId
    ? [request.candidateEmployeeId]
    : enrolled;
  const respond = simController.respond.bind(simController, request.id);
  return (
    <View style={styles.request}>
      <Text style={styles.label}>
        {request.kind === 'FACE' ? strings.dev.camera : strings.dev.sensor}
        {request.candidateEmployeeId
          ? strings.dev.verify(name(request.candidateEmployeeId))
          : strings.dev.identify}
      </Text>
      <View style={styles.chips}>
        {candidates.map(id => (
          <Chip
            key={id}
            label={strings.dev.match(name(id))}
            tone="ok"
            onPress={() =>
              respond({ type: 'match', employeeId: id, score: 92 })
            }
          />
        ))}
        {request.candidateEmployeeId && enrolled.length > 1 ? (
          <Chip
            label={strings.dev.someoneElse}
            tone="bad"
            onPress={() =>
              respond({
                type: 'match',
                employeeId: enrolled.find(
                  id => id !== request.candidateEmployeeId,
                )!,
                score: 90,
              })
            }
          />
        ) : null}
        <Chip
          label={strings.dev.noMatch}
          tone="bad"
          onPress={() => respond({ type: 'no_match' })}
        />
        {request.kind === 'FACE' ? (
          <Chip
            label={strings.dev.spoof}
            tone="bad"
            onPress={() => respond({ type: 'liveness_failed' })}
          />
        ) : null}
      </View>
      {candidates.length === 0 ? (
        <Text style={styles.muted}>{strings.dev.nobodyEnrolled}</Text>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  onPress,
  tone,
}: {
  label: string;
  onPress: () => void;
  tone: 'ok' | 'bad';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, tone === 'ok' ? styles.chipOk : styles.chipBad]}
    >
      <Text
        style={[
          styles.chipText,
          tone === 'ok' ? styles.chipTextOk : styles.chipTextBad,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: space.sm,
    bottom: space.xs,
    alignItems: 'flex-end',
    gap: space.sm,
  },
  fab: {
    backgroundColor: colors.foreground,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
  },
  fabText: { color: colors.white, fontFamily: fonts.monoBold, fontSize: 14 },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontFamily: fonts.heading, fontSize: 16, color: colors.foreground },
  close: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: colors.mutedForeground,
    padding: space.xs,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: space.md },
  legend: { gap: 2 },
  request: { gap: space.sm },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.foreground,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.mutedForeground,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  chipOk: { backgroundColor: colors.successSoft },
  chipBad: { backgroundColor: colors.destructiveSoft },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  chipTextOk: { color: colors.success },
  chipTextBad: { color: colors.destructive },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
