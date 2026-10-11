import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, NetworkError } from '../api/client';
import { useKiosk, useKioskData } from '../app/context';
import { ADMIN_PIN_LENGTH, ENROLL_CODE_LENGTH, TIMING } from '../config';
import { Keypad } from '../components/Keypad';
import { Body, Button, Card, Title } from '../components/ui';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import { useLayout } from '../theme/layout';

export type StaffDestination =
  | { kind: 'supervisor'; enrollToken: string; supervisorName: string }
  | { kind: 'admin' };

type Step = 'choose' | 'code' | 'pin';

interface StaffMenuProps {
  visible: boolean;
  onClose: () => void;
  onOpen: (destination: StaffDestination) => void;
}

/** Opened by tapping the organization logo 5 times. */
export function StaffMenu({ visible, onClose, onOpen }: StaffMenuProps) {
  const service = useKiosk();
  const { pairing } = useKioskData();
  const [step, setStep] = useState<Step>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const layout = useLayout();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    setStep('choose');
    setError(null);
    const timer = setTimeout(onClose, TIMING.supervisorIdle);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  const submitCode = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await service.api.authorizeEnrollment(code);
      onOpen({
        kind: 'supervisor',
        enrollToken: result.enrollToken,
        supervisorName: result.supervisorName,
      });
    } catch (cause) {
      setError(staffError(cause));
      setAttempt(n => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      await service.api.verifyAdminPin(pin);
      onOpen({ kind: 'admin' });
    } catch (cause) {
      setError(staffError(cause));
      setAttempt(n => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const openAdmin = () => {
    // Dev builds without a PIN skip the check so a phone is never locked out.
    if (!pairing?.hasAdminPin && service.isDev) {
      onOpen({ kind: 'admin' });
      return;
    }
    if (!pairing?.hasAdminPin) {
      setError(strings.staff.noPin);
      return;
    }
    setStep('pin');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <ScrollView
        style={styles.backdrop}
        contentContainerStyle={[
          styles.backdropContent,
          {
            paddingTop: insets.top + layout.gutter,
            paddingBottom: insets.bottom + layout.gutter,
            paddingLeft: insets.left + layout.gutter,
            paddingRight: insets.right + layout.gutter,
          },
        ]}
      >
        <Card style={styles.sheet}>
          <View style={styles.titleRow}>
            <Title>{strings.staff.title}</Title>
            <Button
              variant="ghost"
              label={step === 'choose' ? strings.staff.close : strings.staff.back}
              onPress={
                step === 'choose'
                  ? onClose
                  : () => {
                      setError(null);
                      setStep('choose');
                    }
              }
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {step === 'choose' ? (
            <View style={styles.options}>
              <Text style={styles.help}>{strings.staff.intro}</Text>
              <Option
                title={strings.staff.supervisor}
                hint={strings.staff.supervisorHint}
                onPress={() => setStep('code')}
              />
              <Option
                title={strings.staff.admin}
                hint={strings.staff.adminHint}
                onPress={openAdmin}
              />
            </View>
          ) : null}

          {step === 'code' ? (
            <View style={styles.keypad}>
              <Body>{strings.staff.enterCode}</Body>
              <Text style={[styles.help, styles.center]}>
                {strings.staff.codeHelp}
              </Text>
              <Keypad
                length={ENROLL_CODE_LENGTH}
                onComplete={submitCode}
                disabled={busy}
                resetKey={attempt}
              />
            </View>
          ) : null}

          {step === 'pin' ? (
            <View style={styles.keypad}>
              <Body>{strings.staff.enterPin}</Body>
              <Text style={[styles.help, styles.center]}>
                {strings.staff.pinHelp}
              </Text>
              <Keypad
                length={ADMIN_PIN_LENGTH}
                secure
                onComplete={submitPin}
                disabled={busy}
                resetKey={attempt}
              />
            </View>
          ) : null}
        </Card>
      </ScrollView>
    </Modal>
  );
}

function Option({
  title,
  hint,
  onPress,
}: {
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
    >
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionHint}>{hint}</Text>
    </Pressable>
  );
}

function staffError(cause: unknown) {
  if (cause instanceof NetworkError) return strings.staff.online;
  if (cause instanceof ApiError) {
    if (cause.statusCode === 429) return strings.errors.tooMany;
    if (cause.statusCode >= 500) return strings.pairing.serverError;
    return cause.message;
  }
  return strings.errors.generic;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  backdropContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { width: '100%', maxWidth: 560, gap: space.lg },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
  },
  center: { textAlign: 'center' },
  options: { gap: space.md },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: 4,
  },
  optionPressed: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  optionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.foreground,
  },
  optionHint: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  keypad: { alignItems: 'center', gap: space.lg },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.destructive,
    backgroundColor: colors.destructiveSoft,
    padding: space.md,
    borderRadius: radius.lg,
  },
});
