import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HardwareState } from '../api/contract';
import { useKiosk, useKioskData } from '../app/context';
import { pairingUrlWarnings } from '../app/pairing';
import { formatDateTime } from '../components/Header';
import { Button, Card, Pill, Row, Title } from '../components/ui';
import type { KioskLockState } from '../hardware/types';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import { useLayout } from '../theme/layout';

const HARDWARE_TONE: Record<
  HardwareState,
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  READY: 'success',
  UNAVAILABLE: 'neutral',
  LICENSE_MISSING: 'warning',
  ERROR: 'danger',
};

/** Diagnostics and terminal actions, behind the admin PIN. */
export function AdminScreen({ onClose }: { onClose: () => void }) {
  const service = useKiosk();
  const data = useKioskData();
  const pairing = data.pairing!;
  const [hardware, setHardware] = useState<Record<string, HardwareState>>({});
  const [lock, setLock] = useState<KioskLockState>(() =>
    service.hardware.lock.state(),
  );
  const [syncing, setSyncing] = useState(false);
  const [cardSeen, setCardSeen] = useState<string | null>(null);
  // In-app dialogs: the system dialog would use the device font.
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const stopCard = useRef<(() => void) | null>(null);
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const urlWarnings = pairingUrlWarnings(
    pairing.apiUrl,
    __DEV__ || service.isDev,
  );

  const refreshHardware = useCallback(async () => {
    const { face, finger, card } = service.hardware;
    setHardware({
      FACE: face ? await face.status() : 'UNAVAILABLE',
      FINGER: finger ? await finger.status() : 'UNAVAILABLE',
      CARD: card ? card.status() : 'UNAVAILABLE',
    });
  }, [service]);

  useEffect(() => {
    refreshHardware();
    return () => stopCard.current?.();
  }, [refreshHardware]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await service.sync();
      await service.heartbeat();
    } catch {
      // Shown through lastError.
    } finally {
      setSyncing(false);
      refreshHardware();
    }
  };

  const toggleKioskMode = async () => {
    setLockError(null);
    try {
      setLock(
        lock.isLockTaskActive
          ? await service.hardware.lock.exit()
          : await service.hardware.lock.enter(),
      );
    } catch (error) {
      setLockError(
        error instanceof Error ? error.message : strings.errors.generic,
      );
    }
  };

  const testCard = () => {
    stopCard.current?.();
    setCardSeen('…');
    stopCard.current =
      service.hardware.card?.listen(uid => {
        setCardSeen(uid);
        service.hardware.io.signal('success');
      }) ?? null;
  };

  const unpair = async () => {
    if (lock.isLockTaskActive)
      await service.hardware.lock.exit().catch(() => undefined);
    onClose();
    await service.unpair();
  };

  const templatesByKind = Object.values(data.templates).reduce<
    Record<string, number>
  >((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {});

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + layout.gutter,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left + layout.gutter,
            paddingRight: insets.right + layout.gutter,
            gap: layout.compact ? space.md : space.lg,
          },
        ]}
      >
        <View style={styles.top}>
          <Title>{strings.admin.title}</Title>
          <Button
            variant="secondary"
            label={strings.admin.close}
            onPress={onClose}
          />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.section}>{strings.admin.terminal}</Text>
            <Row
              label={strings.admin.kiosk}
              value={`${pairing.kioskName} (${pairing.deviceId})`}
            />
            <Row label={strings.admin.organization} value={pairing.organization.name} />
            <Row
              label={strings.admin.device}
              value={`${service.device.manufacturer} ${service.device.model} · Android ${service.device.androidVersion}`}
            />
            <Row
              label={strings.admin.app}
              value={`${service.device.appVersion} · ${service.hardware.engine}`}
            />
            <Row
              label={strings.admin.policy}
              value={strings.policies[pairing.verificationPolicy]}
            />
          </Card>

          <Card>
            <Text style={styles.section}>{strings.admin.connection}</Text>
            <Row label={strings.admin.server} value={pairing.apiUrl} />
            {urlWarnings.map(warning => (
              <Text key={warning} style={styles.warning}>
                {warning}
              </Text>
            ))}
            <Row
              label={strings.admin.status}
              value={
                <Pill
                  tone={data.online ? 'success' : 'danger'}
                  label={
                    data.online ? strings.common.online : strings.common.offline
                  }
                />
              }
            />
            <Row
              label={strings.admin.lastSync}
              value={formatDateTime(data.sync.lastSyncAt)}
            />
            <Row
              label={strings.admin.lastHeartbeat}
              value={formatDateTime(data.sync.lastHeartbeatAt)}
            />
            <Row
              label={strings.admin.queue}
              value={String(data.queue.length)}
            />
            <Row
              label={strings.admin.employees}
              value={String(Object.keys(data.roster).length)}
            />
            <Row
              label={strings.admin.templates}
              value={strings.admin.templateCounts(
                templatesByKind.FACE ?? 0,
                templatesByKind.FINGER ?? 0,
              )}
            />
            <Row label={strings.admin.cards} value={String(Object.keys(data.cards).length)} />
            {data.sync.lastError ? (
              <Text style={styles.error}>
                {strings.admin.lastError}: {data.sync.lastError}
              </Text>
            ) : null}
            <Text style={styles.help}>{strings.admin.syncHelp}</Text>
            <Button
              label={strings.admin.syncNow}
              loading={syncing}
              onPress={syncNow}
              style={styles.action}
            />
          </Card>

          <Card>
            <Text style={styles.section}>{strings.admin.hardware}</Text>
            {(['FACE', 'FINGER', 'CARD'] as const).map(factor => (
              <Row
                key={factor}
                label={strings.factors[factor]}
                value={
                  <Pill
                    tone={HARDWARE_TONE[hardware[factor] ?? 'UNAVAILABLE']}
                    label={hardware[factor] ?? '…'}
                  />
                }
              />
            ))}
            {cardSeen ? (
              <Text style={styles.note}>
                {strings.admin.cardSeen(cardSeen)}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              <Button
                variant="secondary"
                label={strings.admin.testCard}
                onPress={testCard}
              />
              <Button
                variant="secondary"
                label={strings.admin.testSignals}
                onPress={() => service.hardware.io.signal('success')}
              />
            </View>
          </Card>

          <Card>
            <Text style={styles.section}>{strings.admin.kioskMode}</Text>
            <Row
              label={strings.admin.deviceOwner}
              value={
                lock.isDeviceOwner ? strings.common.yes : strings.common.no
              }
            />
            {lockError ? <Text style={styles.error}>{lockError}</Text> : null}
            <Button
              variant="secondary"
              label={
                lock.isLockTaskActive
                  ? strings.admin.exitKiosk
                  : strings.admin.enterKiosk
              }
              onPress={toggleKioskMode}
              style={styles.action}
            />
          </Card>

          {confirmUnpair ? (
            <Card style={styles.confirm}>
              <Text style={styles.confirmText}>
                {strings.admin.unpairConfirm}
              </Text>
              <Button
                variant="destructive"
                label={strings.admin.unpair}
                onPress={unpair}
              />
              <Button
                variant="secondary"
                label={strings.admin.unpairCancel}
                onPress={() => setConfirmUnpair(false)}
              />
            </Card>
          ) : (
            <Button
              variant="destructive"
              label={strings.admin.unpair}
              onPress={() => setConfirmUnpair(true)}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
    marginTop: space.md,
  },
  warning: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.warningForeground,
    backgroundColor: colors.warningSoft,
    padding: space.md,
    borderRadius: radius.lg,
    marginTop: space.md,
  },
  content: { gap: space.lg, paddingBottom: space.xxl },
  section: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.foreground,
    marginBottom: space.sm,
  },
  action: { marginTop: space.lg },
  buttons: { gap: space.md, marginTop: space.lg },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.destructive,
    marginTop: space.md,
  },
  confirm: {
    gap: space.md,
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveSoft,
  },
  confirmText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.destructive,
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.secondaryForeground,
    marginTop: space.md,
  },
});
