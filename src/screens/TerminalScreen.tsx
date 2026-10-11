import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useKiosk, useKioskData } from '../app/context';
import { TIMING } from '../config';
import { ActionTile, eventColor } from '../components/ActionTile';
import { CountdownBar } from '../components/CountdownBar';
import { BrandBackdrop } from '../components/BrandBackdrop';
import { formatTime, Header } from '../components/Header';
import { ScanFrame } from '../components/ScanFrame';
import { Avatar, Button, Card } from '../components/ui';
import { allowedNextEvents, suggestedEvent } from '../domain/attendance';
import { PunchFlow, type FlowState } from '../domain/punchFlow';
import { DevPanel } from './DevPanel';
import { StaffMenu, type StaffDestination } from './StaffMenu';
import { SupervisorScreen } from './SupervisorScreen';
import { AdminScreen } from './AdminScreen';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import { useLayout, type Layout } from '../theme/layout';

export function TerminalScreen() {
  const service = useKiosk();
  const data = useKioskData();
  const pairing = data.pairing!;
  const layout = useLayout();
  const { landscape, compact } = layout;
  const short = layout.height < 480;

  const flow = useMemo(
    () =>
      new PunchFlow({
        hardware: service.hardware,
        policy: () =>
          service.store.getSnapshot().pairing?.verificationPolicy ??
          'FACE_OR_FINGER',
        employee: id => service.store.employee(id),
        cardByUid: uid => service.cardByUid(uid),
        employeeStatus: id => service.employeeStatus(id),
        isOnline: () => service.store.getSnapshot().online,
        punch: request => service.punch(request),
      }),
    [service],
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getState);

  const [staffMenu, setStaffMenu] = useState(false);
  const [destination, setDestination] = useState<StaffDestination | null>(null);
  const overlayOpen = staffMenu || destination !== null;

  useEffect(() => {
    flow.start();
    service.hardware.lock.keepScreenOn(true);
    if (!service.isDev) {
      // Provisioned terminals lock themselves into kiosk mode on start.
      const lock = service.hardware.lock.state();
      if (lock.isDeviceOwner && !lock.isLockTaskActive) {
        service.hardware.lock.enter().catch(() => undefined);
      }
    }
    return () => flow.dispose();
  }, [flow, service]);

  useEffect(() => {
    if (overlayOpen) flow.pause();
    else flow.resume();
  }, [overlayOpen, flow]);

  useEffect(() => {
    flow.refresh();
  }, [pairing.verificationPolicy, flow]);

  const taps = useRef<number[]>([]);
  const onLogoPress = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < 3000), now];
    if (taps.current.length >= TIMING.staffMenuTaps) {
      taps.current = [];
      setStaffMenu(true);
    }
  };

  const FacePreview = service.hardware.face?.Preview;
  const showCamera =
    !overlayOpen &&
    ((state.phase === 'idle' && state.identify.includes('FACE')) ||
      (state.phase === 'confirm' && state.factor === 'FACE'));

  // Portrait: the stage (camera / illustration) takes the top; when the panel
  // needs the room (choosing an action) the stage shrinks or folds away.
  const cameraPhase = state.phase === 'idle' || state.phase === 'confirm';
  const stageStyle = landscape
    ? styles.stageLandscape
    : cameraPhase
    ? { flex: compact ? 1.1 : 1.3 }
    : state.phase === 'choose' || state.phase === 'submitting'
    ? compact
      ? styles.stageHidden
      : { flex: 0.5 }
    : { flex: compact ? 0.55 : 0.8 };

  return (
    <View style={styles.screen}>
      <BrandBackdrop />
      <Header
        organizationName={pairing.organization.name}
        kioskName={pairing.kioskName}
        online={data.online}
        queued={data.queue.length}
        onLogoPress={onLogoPress}
      />

      <View
        style={[
          styles.body,
          {
            paddingHorizontal: layout.gutter,
            gap: compact ? space.md : space.xl,
          },
          landscape && styles.bodyLandscape,
        ]}
      >
        <View style={[styles.stage, stageStyle]}>
          {FacePreview ? (
            <FacePreview style={styles.preview} active={showCamera} />
          ) : null}
          {showCamera ? <ScanFrame active /> : null}
          {!showCamera ? (
            <StageIllustration state={state} layout={layout} />
          ) : null}
        </View>

        <ScrollView
          style={styles.panel}
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
        >
          <FlowPanel
            flow={flow}
            state={state}
            layout={layout}
            queued={data.queue.length}
            online={data.online}
            isDev={service.isDev}
          />
        </ScrollView>
      </View>

      <View
        style={[
          styles.footer,
          { paddingVertical: short ? space.xs : space.md },
          service.isDev && styles.footerDev,
        ]}
      >
        <Image
          source={require('../../assets/images/rona-logo-dark.png')}
          style={styles.footerLogo}
          resizeMode="contain"
        />
        {compact ? null : (
          <Text style={styles.footerText} numberOfLines={1}>
            {strings.tagline}
          </Text>
        )}
        <Text style={styles.footerHint} numberOfLines={1}>
          {compact ? '' : '· '}
          {strings.idle.staffHint}
        </Text>
      </View>

      {service.isDev && !overlayOpen ? <DevPanel /> : null}

      <StaffMenu
        visible={staffMenu}
        onClose={() => setStaffMenu(false)}
        onOpen={target => {
          setStaffMenu(false);
          setDestination(target);
        }}
      />
      {destination?.kind === 'supervisor' ? (
        <SupervisorScreen
          enrollToken={destination.enrollToken}
          supervisorName={destination.supervisorName}
          onClose={() => setDestination(null)}
        />
      ) : null}
      {destination?.kind === 'admin' ? (
        <AdminScreen onClose={() => setDestination(null)} />
      ) : null}
    </View>
  );
}

function StageIllustration({
  state,
  layout,
}: {
  state: FlowState;
  layout: Layout;
}) {
  const size = layout.s(160);
  if (state.phase === 'idle' && state.identify.includes('CARD')) {
    return <BigGlyph glyph={CARD} caption={strings.idle.tapCard} size={size} />;
  }
  if (
    (state.phase === 'idle' && state.identify.includes('FINGER')) ||
    (state.phase === 'confirm' && state.factor === 'FINGER')
  ) {
    return <BigGlyph glyph={FINGER} caption="" size={size} />;
  }
  if (state.phase === 'success') {
    return (
      <BigGlyph
        glyph="✓"
        caption=""
        size={size}
        tone={eventColor(state.eventType)}
      />
    );
  }
  if (state.phase === 'error' || state.phase === 'unavailable') {
    return (
      <BigGlyph glyph="!" caption="" size={size} tone={colors.destructive} />
    );
  }
  return <BigGlyph glyph="" caption="" size={size} />;
}

// The bundled fonts have no card or fingerprint symbol (and the terminal's
// system font can't be trusted), so these two are drawn.
const CARD = 'card';
const FINGER = 'finger';

function DrawnGlyph({
  glyph,
  size,
  tone,
}: {
  glyph: string;
  size: number;
  tone: string;
}) {
  if (glyph === CARD) {
    return (
      <View
        style={[
          styles.drawnCard,
          {
            borderColor: tone,
            width: size * 0.5,
            height: size * 0.34,
            paddingTop: size * 0.06,
          },
        ]}
      >
        <View style={{ height: size * 0.05, backgroundColor: tone }} />
      </View>
    );
  }
  // Fingerprint: concentric rings.
  return (
    <View style={styles.drawnCenter}>
      {[0.5, 0.34, 0.18].map(ratio => (
        <View
          key={ratio}
          style={[
            styles.drawnRing,
            {
              borderColor: tone,
              width: size * ratio,
              height: size * ratio,
              borderRadius: (size * ratio) / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

function BigGlyph({
  glyph,
  caption,
  size,
  tone = colors.scan,
}: {
  glyph: string;
  caption: string;
  size: number;
  tone?: string;
}) {
  // The stage can be short (portrait phone while a result shows): shrink to fit.
  const [fit, setFit] = useState(size);
  return (
    <View
      style={styles.glyphStage}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setFit(Math.round(Math.max(48, Math.min(size, width * 0.6, height * 0.7))));
      }}
    >
      {glyph ? (
        <View
          style={[
            styles.glyphCircle,
            {
              borderColor: tone,
              width: fit,
              height: fit,
              borderRadius: fit / 2,
            },
          ]}
        >
          {glyph === CARD || glyph === FINGER ? (
            <DrawnGlyph glyph={glyph} size={fit} tone={tone} />
          ) : (
            <Text
              style={[styles.glyph, { color: tone, fontSize: fit * 0.45 }]}
            >
              {glyph}
            </Text>
          )}
        </View>
      ) : null}
      {caption ? <Text style={styles.glyphCaption}>{caption}</Text> : null}
    </View>
  );
}

interface FlowPanelProps {
  flow: PunchFlow;
  state: FlowState;
  layout: Layout;
  queued: number;
  online: boolean;
  isDev: boolean;
}

function FlowPanel({
  flow,
  state,
  layout,
  queued,
  online,
  isDev,
}: FlowPanelProps) {
  const { s } = layout;
  const promptTitle = [
    styles.promptTitle,
    { fontSize: s(30), lineHeight: s(40) },
  ];
  const greeting = [styles.greeting, { fontSize: Math.max(18, s(24)) }];
  switch (state.phase) {
    case 'idle':
      return (
        <View style={styles.prompt}>
          <Text style={promptTitle}>{idlePrompt(state.identify)}</Text>
          <Text style={styles.promptHint}>{idleHint(state.identify)}</Text>
          {queued > 0 ? (
            <Text style={styles.offline}>
              {strings.idle.savedOffline(queued)}
            </Text>
          ) : null}
          {!online && queued === 0 ? (
            <Text style={styles.offline}>{strings.idle.offline}</Text>
          ) : null}
          {isDev ? <Text style={styles.devHint}>{strings.idle.devHint}</Text> : null}
        </View>
      );

    case 'unavailable':
      return (
        <Card style={styles.messageCard}>
          <Text style={styles.errorTitle}>{strings.idle.notReady}</Text>
          {state.missing.map(factor => (
            <Text key={factor} style={styles.promptHint}>
              {strings.errors.hardwareMissing(strings.factors[factor])}
            </Text>
          ))}
          <Text style={styles.promptHint}>{strings.idle.notReadyHint}</Text>
        </Card>
      );

    case 'confirm':
      return (
        <View style={styles.prompt}>
          <Text style={greeting}>
            {strings.verify.hello(state.employeeName)}
          </Text>
          <Text style={promptTitle}>
            {state.factor === 'FACE'
              ? strings.verify.confirmWithFace
              : strings.verify.confirmWithFinger}
          </Text>
          <CountdownBar
            durationMs={TIMING.secondFactorTimeout}
            onDone={() => undefined}
          />
          <Button
            variant="ghost"
            label={strings.verify.cancel}
            onPress={() => flow.cancel()}
          />
        </View>
      );

    case 'choose': {
      const allowed =
        state.status?.allowedNextEvents ?? allowedNextEvents(undefined);
      const suggested = state.status ? suggestedEvent(allowed) : null;
      return (
        <View style={styles.choose}>
          <View style={styles.who}>
            <Avatar name={state.employeeName} size={layout.compact ? 48 : 64} />
            <View style={styles.whoText}>
              <Text style={greeting} numberOfLines={1}>
                {strings.verify.hello(state.employeeName)}
              </Text>
              <Text style={styles.promptHint}>{strings.action.title}</Text>
            </View>
          </View>
          {state.status ? (
            <View style={styles.tiles}>
              {allowed.map(eventType => (
                <ActionTile
                  key={eventType}
                  layout={layout}
                  eventType={eventType}
                  highlighted={eventType === suggested}
                  onPress={() => flow.select(eventType)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.promptHint}>{strings.action.loading}</Text>
            </View>
          )}
          {state.offline ? (
            <Text style={styles.offline}>{strings.action.offlineHint}</Text>
          ) : null}
          <CountdownBar
            durationMs={TIMING.chooseActionTimeout}
            onDone={() => undefined}
          />
          <Button
            variant="ghost"
            label={strings.verify.cancel}
            onPress={() => flow.cancel()}
          />
        </View>
      );
    }

    case 'submitting':
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={promptTitle}>
            {strings.events[state.eventType]}…
          </Text>
        </View>
      );

    case 'success':
      return (
        <Card style={styles.messageCard}>
          <Text
            style={[
              styles.successEvent,
              { color: eventColor(state.eventType), fontSize: Math.max(18, s(22)) },
            ]}
          >
            {strings.eventsDone[state.eventType]}
          </Text>
          <Text
            style={[
              styles.successName,
              { fontSize: s(36), lineHeight: Math.round(s(36) * 1.22) },
            ]}
          >
            {state.employeeName}
          </Text>
          <Text style={[styles.successTime, { fontSize: s(40) }]}>
            {formatTime(new Date(state.eventAt))}
          </Text>
          {state.queued ? (
            <Text style={styles.offline}>
              {strings.result.savedOffline(Math.max(queued, 1))}
            </Text>
          ) : null}
          <CountdownBar
            durationMs={TIMING.resultDisplay}
            onDone={() => undefined}
            color={eventColor(state.eventType)}
          />
        </Card>
      );

    case 'error':
      return (
        <Card style={[styles.messageCard, styles.errorCard]}>
          <Text style={styles.errorTitle}>{state.message}</Text>
          <CountdownBar
            durationMs={TIMING.errorDisplay}
            onDone={() => undefined}
            color={colors.destructive}
          />
        </Card>
      );
  }
}

function idleHint(identify: string[]) {
  if (identify.includes('CARD')) return strings.idle.cardHint;
  if (identify.includes('FACE') && identify.includes('FINGER'))
    return strings.idle.lookAtCameraHint;
  if (identify.includes('FACE')) return strings.idle.lookAtCameraHint;
  return strings.idle.fingerHint;
}

function idlePrompt(identify: string[]) {
  if (identify.includes('CARD')) return strings.idle.tapCard;
  if (identify.includes('FACE') && identify.includes('FINGER'))
    return strings.idle.faceOrFinger;
  if (identify.includes('FACE')) return strings.idle.lookAtCamera;
  return strings.verify.confirmWithFinger;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyLandscape: { flexDirection: 'row' },
  stage: {
    flex: 1.3,
    borderRadius: radius.xxl + 10,
    overflow: 'hidden',
    backgroundColor: colors.night,
  },
  stageLandscape: { flex: 1.1 },
  stageHidden: { flex: 0, height: 0 },
  preview: StyleSheet.absoluteFill,
  panel: { flex: 1 },
  panelContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  prompt: { alignItems: 'center', gap: space.md },
  promptTitle: {
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 40,
    color: colors.foreground,
    textAlign: 'center',
  },
  promptHint: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  devHint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondaryForeground,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    textAlign: 'center',
    overflow: 'hidden',
  },
  greeting: { fontFamily: fonts.heading, fontSize: 24, color: colors.brand },
  choose: { gap: space.lg },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  whoText: { flexShrink: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  loading: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  offline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.warningForeground,
    textAlign: 'center',
  },
  messageCard: { gap: space.md, alignItems: 'center' },
  errorCard: {
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveSoft,
  },
  errorTitle: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 30,
    color: colors.destructive,
    textAlign: 'center',
  },
  successEvent: { fontFamily: fonts.heading, fontSize: 22 },
  successName: {
    fontFamily: fonts.headingBold,
    fontSize: 36,
    lineHeight: 44,
    color: colors.foreground,
    textAlign: 'center',
  },
  successTime: {
    fontFamily: fonts.monoBold,
    fontSize: 40,
    color: colors.foreground,
  },
  glyphStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
  },
  glyphCircle: {
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontFamily: fonts.bodyBold },
  drawnCard: { borderWidth: 3, borderRadius: radius.md },
  drawnCenter: { alignItems: 'center', justifyContent: 'center' },
  drawnRing: { position: 'absolute', borderWidth: 3 },
  glyphCaption: {
    color: colors.nightMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  // Leaves room on the right for the DEV button.
  footerDev: { paddingRight: 88 },
  footerLogo: { width: 56, height: 20, opacity: 0.6 },
  footerText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.mutedForeground,
    flexShrink: 1,
  },
  footerHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.mutedForeground,
    opacity: 0.75,
    flexShrink: 0,
  },
});
