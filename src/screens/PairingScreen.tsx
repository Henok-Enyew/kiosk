import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { z } from 'zod';
import { useKiosk } from '../app/context';
import {
  describePairingError,
  normalizePairingUrl,
  pairingUrlWarnings,
} from '../app/pairing';
import { BrandBackdrop } from '../components/BrandBackdrop';
import { Body, Button, Card, Title } from '../components/ui';
import { ScanFrame } from '../components/ScanFrame';
import { ensureCameraPermission } from '../hardware/android/permissions';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import { useLayout } from '../theme/layout';

const qrPayloadSchema = z.object({
  v: z.literal(1),
  api: z.url(),
  token: z.string().min(1).max(512),
});

export function parsePairingQr(raw: string) {
  try {
    return qrPayloadSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

type Mode = 'choose' | 'scan' | 'manual';

export function PairingScreen({ notice }: { notice?: string | null }) {
  const service = useKiosk();
  const layout = useLayout();
  // Debug builds and the dev flavor allow http://; prod release is https-only.
  const allowsCleartext = __DEV__ || service.isDev;
  const [mode, setMode] = useState<Mode>('choose');
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanning = useRef(false);

  const pair = useCallback(
    async (payload: { apiUrl: string; token: string }) => {
      setBusy(true);
      setError(null);
      try {
        await service.pair(payload);
      } catch (cause) {
        setError(
          describePairingError(cause, payload.apiUrl, allowsCleartext),
        );
        setMode(current => (current === 'scan' ? 'choose' : current));
      } finally {
        setBusy(false);
        scanning.current = false;
      }
    },
    [service, allowsCleartext],
  );

  const manualUrl = apiUrl.trim() ? normalizePairingUrl(apiUrl) : '';
  const urlWarnings = pairingUrlWarnings(manualUrl, allowsCleartext);
  const scannerHeight = Math.max(
    200,
    Math.min(340, layout.width - 2 * layout.gutter - 32, layout.height * 0.45),
  );

  const onCode = useCallback(
    (raw: string) => {
      if (scanning.current) return;
      const payload = parsePairingQr(raw);
      if (!payload) {
        setError(strings.pairing.invalidQr);
        return;
      }
      scanning.current = true;
      pair({ apiUrl: normalizePairingUrl(payload.api), token: payload.token });
    },
    [pair],
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="height">
      <BrandBackdrop />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            padding: layout.gutter,
            gap: layout.compact ? space.lg : space.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require('../../assets/images/rona-logo.png')}
          style={{ width: layout.s(200), height: layout.s(72) }}
          resizeMode="contain"
        />
        <Card style={styles.card}>
          <Title>{strings.pairing.title}</Title>
          <Body>{strings.pairing.subtitle}</Body>
          {mode === 'choose' ? (
            <View style={styles.steps}>
              {strings.pairing.steps.map((step, index) => (
                <View key={step} style={styles.step}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mode === 'choose' ? (
            <View style={styles.actions}>
              <Button
                label={strings.pairing.scan}
                onPress={() => setMode('scan')}
              />
              <Button
                variant="secondary"
                label={strings.pairing.manual}
                onPress={() => setMode('manual')}
              />
            </View>
          ) : null}

          {mode === 'scan' ? (
            <View style={styles.actions}>
              <Text style={styles.help}>{strings.pairing.scanHint}</Text>
              <QrScanner onCode={onCode} busy={busy} height={scannerHeight} />
              <Button
                variant="ghost"
                label={strings.pairing.back}
                onPress={() => setMode('choose')}
              />
            </View>
          ) : null}

          {mode === 'manual' ? (
            <View style={styles.actions}>
              <Text style={styles.help}>{strings.pairing.manualHint}</Text>
              <Text style={styles.label}>{strings.pairing.apiUrl}</Text>
              <TextInput
                style={styles.input}
                value={apiUrl}
                onChangeText={setApiUrl}
                placeholder={strings.pairing.apiUrlHint}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.help}>{strings.pairing.apiUrlHelp}</Text>
              {urlWarnings.map(warning => (
                <Text key={warning} style={styles.notice}>
                  {warning}
                </Text>
              ))}
              <Text style={styles.label}>{strings.pairing.token}</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <Text style={styles.help}>{strings.pairing.tokenHelp}</Text>
              <Button
                label={busy ? strings.pairing.pairing : strings.pairing.pair}
                loading={busy}
                disabled={!apiUrl.trim() || !token.trim()}
                onPress={() => pair({ apiUrl: manualUrl, token: token.trim() })}
              />
              <Button
                variant="ghost"
                label={strings.pairing.back}
                onPress={() => setMode('choose')}
              />
            </View>
          ) : null}
        </Card>
        <Text style={styles.tagline}>{strings.tagline}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function QrScanner({
  onCode,
  busy,
  height,
}: {
  onCode: (raw: string) => void;
  busy: boolean;
  height: number;
}) {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    ensureCameraPermission().then(setGranted);
  }, []);

  return (
    <View style={[styles.scanner, { height }]}>
      {granted ? (
        <Camera
          style={StyleSheet.absoluteFill}
          cameraType={CameraType.Back}
          scanBarcode={!busy}
          allowedBarcodeTypes={['qr']}
          onReadCode={event => onCode(event.nativeEvent.codeStringValue)}
          resizeMode="cover"
        />
      ) : (
        <Text style={styles.scannerText}>
          {granted === false ? strings.camera.permissionDenied : ''}
        </Text>
      )}
      <ScanFrame active={!busy} />
      {busy ? (
        <Text style={styles.scannerBusy}>{strings.pairing.pairing}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: { width: '100%', maxWidth: 560, gap: space.lg },
  steps: { gap: space.sm },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 26,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.foreground,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
  },
  actions: { gap: space.md, marginTop: space.sm },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.secondaryForeground,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: space.lg,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notice: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.warningForeground,
    backgroundColor: colors.warningSoft,
    padding: space.md,
    borderRadius: radius.lg,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.destructive,
    backgroundColor: colors.destructiveSoft,
    padding: space.md,
    borderRadius: radius.lg,
  },
  scanner: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: colors.night,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerText: {
    color: colors.nightMuted,
    fontFamily: fonts.body,
    padding: space.xl,
  },
  scannerBusy: {
    position: 'absolute',
    bottom: space.lg,
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
