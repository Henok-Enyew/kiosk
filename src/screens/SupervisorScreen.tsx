import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, NetworkError } from '../api/client';
import type { RosterEntry } from '../api/contract';
import { useKiosk, useKioskData } from '../app/context';
import type { TemplateKind } from '../config';
import { Avatar, Body, Button, Card, Pill, Title } from '../components/ui';
import type {
  BiometricEngine,
  EnrollProgress,
  StoredTemplate,
} from '../hardware/types';
import { strings } from '../i18n/strings';
import { colors, fonts, radius, space } from '../theme';
import { useLayout } from '../theme/layout';

interface SupervisorScreenProps {
  enrollToken: string;
  supervisorName: string;
  onClose: () => void;
}

type Task =
  | { type: 'consent'; kind: TemplateKind; fingerIndex?: number }
  | { type: 'pickFinger' }
  | { type: 'capturing'; kind: TemplateKind; progress: EnrollProgress | null }
  | { type: 'card' }
  | { type: 'saving' }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };

/** Enrollment happens here, on the terminal, with the vendor engine that will match later. */
export function SupervisorScreen({
  enrollToken,
  supervisorName,
  onClose,
}: SupervisorScreenProps) {
  const service = useKiosk();
  const data = useKioskData();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stopCard = useRef<(() => void) | null>(null);
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const short = layout.height < 520;

  const employees = useMemo(() => {
    const term = query.trim().toLowerCase();
    return Object.values(data.roster)
      .filter(
        e =>
          !term ||
          e.fullName.toLowerCase().includes(term) ||
          e.eid.toLowerCase().includes(term),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [data.roster, query]);

  const selected = selectedId ? data.roster[selectedId] : undefined;
  const templates = useMemo(
    () =>
      Object.values(data.templates).filter(t => t.employeeId === selectedId),
    [data.templates, selectedId],
  );
  const cards = useMemo(
    () => Object.values(data.cards).filter(c => c.employeeId === selectedId),
    [data.cards, selectedId],
  );

  useEffect(
    () => () => {
      abort.current?.abort();
      stopCard.current?.();
    },
    [],
  );

  const handleError = (cause: unknown) => {
    if (cause instanceof ApiError && cause.statusCode === 401) {
      onClose();
      return;
    }
    setTask({ type: 'error', message: enrollErrorMessage(cause) });
  };

  const engineFor = (kind: TemplateKind): BiometricEngine | null =>
    kind === 'FACE' ? service.hardware.face : service.hardware.finger;

  const capture = async (
    employee: RosterEntry,
    kind: TemplateKind,
    fingerIndex?: number,
  ) => {
    const engine = engineFor(kind);
    if (!engine) {
      setTask({
        type: 'error',
        message: strings.errors.hardwareMissing(strings.factors[kind]),
      });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setTask({ type: 'capturing', kind, progress: null });
    try {
      const outcome = await engine.enroll({
        employeeId: employee.employeeId,
        fingerIndex,
        signal: controller.signal,
        onProgress: progress => setTask({ type: 'capturing', kind, progress }),
      });
      if (outcome.type === 'cancelled') {
        setTask(null);
        return;
      }
      if (outcome.type === 'failed') {
        setTask({ type: 'error', message: outcome.message });
        return;
      }
      setTask({ type: 'saving' });
      const saved = await service.api.enrollTemplate(enrollToken, {
        employeeId: employee.employeeId,
        kind,
        fingerIndex,
        algorithmVersion: outcome.algorithmVersion,
        template: outcome.template,
        consentAt: new Date().toISOString(),
      });
      // Re-enrolling the same face/finger revokes the previous template server-side.
      const replaced = Object.values(
        service.store.getSnapshot().templates,
      ).filter(
        t =>
          t.employeeId === employee.employeeId &&
          t.kind === kind &&
          (t.fingerIndex ?? null) === (fingerIndex ?? null),
      );
      await service.store.mergeTemplates([
        ...replaced.map(t => ({
          ...t,
          template: null,
          createdAt: '',
          revokedAt: new Date().toISOString(),
        })),
        saved,
      ]);
      await service.loadEnginesFromStore();
      service.hardware.io.signal('success');
      setTask({ type: 'done', message: strings.supervisor.done });
    } catch (cause) {
      handleError(cause);
    }
  };

  const bindCard = (employee: RosterEntry) => {
    const reader = service.hardware.card;
    if (!reader) {
      setTask({
        type: 'error',
        message: strings.errors.hardwareMissing(strings.factors.CARD),
      });
      return;
    }
    setTask({ type: 'card' });
    stopCard.current = reader.listen(async uid => {
      stopCard.current?.();
      stopCard.current = null;
      setTask({ type: 'saving' });
      try {
        const card = await service.api.bindCard(enrollToken, {
          employeeId: employee.employeeId,
          uid,
        });
        await service.store.mergeCards([card]);
        service.hardware.io.signal('success');
        setTask({ type: 'done', message: strings.supervisor.done });
      } catch (cause) {
        handleError(cause);
      }
    });
  };

  const revoke = async (template: StoredTemplate) => {
    setTask({ type: 'saving' });
    try {
      const revoked = await service.api.revokeTemplate(
        enrollToken,
        template.id,
      );
      await service.store.mergeTemplates([revoked]);
      await service.loadEnginesFromStore();
      setTask(null);
    } catch (cause) {
      handleError(cause);
    }
  };

  const cancelTask = () => {
    abort.current?.abort();
    stopCard.current?.();
    stopCard.current = null;
    setTask(null);
  };

  const face = templates.find(t => t.kind === 'FACE');
  const fingers = templates
    .filter(t => t.kind === 'FINGER')
    .sort((a, b) => (a.fingerIndex ?? 0) - (b.fingerIndex ?? 0));

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
            paddingTop: insets.top + (short ? space.sm : layout.gutter),
            paddingBottom: insets.bottom + space.sm,
            paddingLeft: insets.left + layout.gutter,
            paddingRight: insets.right + layout.gutter,
            gap: layout.compact ? space.md : space.lg,
          },
        ]}
      >
        <View style={styles.top}>
          <View style={styles.topText}>
            <Title>{strings.supervisor.title}</Title>
            <Body>{strings.supervisor.signedInAs(supervisorName)}</Body>
          </View>
          <Button
            label={strings.supervisor.exit}
            variant="secondary"
            onPress={onClose}
          />
        </View>

        {selected ? (
          <ScrollView contentContainerStyle={styles.detail}>
            <Button
              variant="ghost"
              label={`← ${strings.pairing.back}`}
              onPress={() => setSelectedId(null)}
              style={styles.back}
            />
            <View style={styles.who}>
              <Avatar name={selected.fullName} />
              <View style={styles.whoText}>
                <Text
                  style={[styles.name, layout.compact && styles.nameCompact]}
                >
                  {selected.fullName}
                </Text>
                <Text style={styles.eid}>{selected.eid}</Text>
                {!selected.active ? (
                  <Pill tone="danger" label={strings.supervisor.inactive} />
                ) : null}
              </View>
            </View>

            <Section title={strings.supervisor.face}>
              <Text style={styles.help}>{strings.supervisor.faceHelp}</Text>
              <View style={styles.itemRow}>
                <Pill
                  tone={face ? 'success' : 'neutral'}
                  label={
                    face
                      ? strings.supervisor.enrolled
                      : strings.supervisor.notEnrolled
                  }
                />
                <View style={styles.itemActions}>
                  {face ? (
                    <Button
                      variant="ghost"
                      label={strings.supervisor.revoke}
                      onPress={() => revoke(face)}
                    />
                  ) : null}
                  <Button
                    label={
                      face
                        ? strings.supervisor.reenrollFace
                        : strings.supervisor.enrollFace
                    }
                    onPress={() => setTask({ type: 'consent', kind: 'FACE' })}
                  />
                </View>
              </View>
            </Section>

            <Section title={strings.supervisor.fingers}>
              <Text style={styles.help}>{strings.supervisor.fingerHelp}</Text>
              {fingers.map(finger => (
                <View key={finger.id} style={styles.itemRow}>
                  <Text style={styles.itemLabel}>
                    {strings.fingers[finger.fingerIndex ?? 0]}
                  </Text>
                  <Button
                    variant="ghost"
                    label={strings.supervisor.revoke}
                    onPress={() => revoke(finger)}
                  />
                </View>
              ))}
              <Button
                variant="secondary"
                label={strings.supervisor.addFinger}
                onPress={() => setTask({ type: 'pickFinger' })}
              />
            </Section>

            <Section title={strings.supervisor.cards}>
              <Text style={styles.help}>{strings.supervisor.cardHelp}</Text>
              {cards.map((card, index) => (
                <View key={card.id} style={styles.itemRow}>
                  {/* The terminal only knows card hashes; HR removes cards in Rona. */}
                  <Text style={styles.itemLabel}>
                    {strings.supervisor.cards} {index + 1}
                  </Text>
                  <Pill tone="success" label={strings.supervisor.enrolled} />
                </View>
              ))}
              <Button
                variant="secondary"
                label={strings.supervisor.addCard}
                onPress={() => bindCard(selected)}
              />
            </Section>
          </ScrollView>
        ) : (
          <View style={styles.list}>
            {short ? null : (
              <View style={styles.steps}>
                {strings.supervisor.steps.map((step, index) => (
                  <Text key={step} style={styles.help}>
                    {index + 1}. {step}
                  </Text>
                ))}
              </View>
            )}
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={strings.supervisor.search}
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
            />
            <FlatList
              data={employees}
              keyExtractor={item => item.employeeId}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.help}>
                  {Object.keys(data.roster).length
                    ? strings.supervisor.noResults
                    : strings.supervisor.noEmployees}
                </Text>
              }
              renderItem={({ item }) => {
                const own = Object.values(data.templates).filter(
                  t => t.employeeId === item.employeeId,
                );
                const hasFace = own.some(t => t.kind === 'FACE');
                const fingerCount = own.filter(t => t.kind === 'FINGER').length;
                return (
                  <Pressable
                    onPress={() => setSelectedId(item.employeeId)}
                    style={({ pressed }) => [
                      styles.employee,
                      pressed && styles.employeePressed,
                    ]}
                  >
                    <Avatar name={item.fullName} size={48} />
                    <View style={styles.whoText}>
                      <Text style={styles.employeeName} numberOfLines={2}>
                        {item.fullName}
                      </Text>
                      <Text style={styles.eid}>{item.eid}</Text>
                    </View>
                    <View style={styles.badges}>
                      {hasFace ? (
                        <Pill tone="success" label={strings.supervisor.face} />
                      ) : null}
                      {fingerCount ? (
                        <Pill
                          tone="brand"
                          label={strings.supervisor.fingerCount(fingerCount)}
                        />
                      ) : null}
                      {!item.active ? (
                        <Pill
                          tone="danger"
                          label={strings.supervisor.inactive}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        <TaskSheet
          task={task}
          employeeName={selected?.fullName ?? ''}
          onCancel={cancelTask}
          onConsent={t => selected && capture(selected, t.kind, t.fingerIndex)}
          onPickFinger={index =>
            setTask({ type: 'consent', kind: 'FINGER', fingerIndex: index })
          }
          takenFingers={fingers.map(f => f.fingerIndex ?? -1)}
        />
      </View>
    </Modal>
  );
}

/** Server failures get a message a supervisor can act on, not the raw error. */
export function enrollErrorMessage(cause: unknown): string {
  if (cause instanceof NetworkError) return strings.staff.online;
  if (cause instanceof ApiError) {
    if (cause.statusCode >= 500) return strings.supervisor.serverFailed;
    if (cause.statusCode === 429) return strings.errors.tooMany;
    return cause.message || strings.errors.generic;
  }
  return strings.errors.generic;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Card>
  );
}

function TaskSheet({
  task,
  employeeName,
  onCancel,
  onConsent,
  onPickFinger,
  takenFingers,
}: {
  task: Task | null;
  employeeName: string;
  onCancel: () => void;
  onConsent: (task: Extract<Task, { type: 'consent' }>) => void;
  onPickFinger: (index: number) => void;
  takenFingers: number[];
}) {
  if (!task) return null;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      <TaskBackdrop>
        <Card style={styles.sheet}>
          {task.type === 'consent' ? (
            <>
              <Title>{strings.supervisor.consentTitle}</Title>
              <Text style={styles.help}>{strings.supervisor.consentHint}</Text>
              <Body>{strings.supervisor.consentBody(employeeName)}</Body>
              <Button
                label={strings.supervisor.consentAgree}
                onPress={() => onConsent(task)}
              />
              <Button
                variant="ghost"
                label={strings.common.cancel}
                onPress={onCancel}
              />
            </>
          ) : null}

          {task.type === 'pickFinger' ? (
            <>
              <Title>{strings.supervisor.chooseFinger}</Title>
              <View style={styles.fingerGrid}>
                {strings.fingers.map((label, index) => (
                  <Button
                    key={label}
                    variant="secondary"
                    label={label}
                    disabled={takenFingers.includes(index)}
                    onPress={() => onPickFinger(index)}
                    style={styles.fingerButton}
                  />
                ))}
              </View>
              <Button
                variant="ghost"
                label={strings.common.cancel}
                onPress={onCancel}
              />
            </>
          ) : null}

          {task.type === 'capturing' ? (
            <>
              <Title>
                {task.kind === 'FACE'
                  ? strings.supervisor.enrollFace
                  : strings.supervisor.addFinger}
              </Title>
              <Text style={styles.help}>
                {task.kind === 'FACE'
                  ? strings.supervisor.faceHelp
                  : strings.supervisor.fingerHelp}
              </Text>
              <Body>{task.progress?.message ?? strings.verify.scanning}</Body>
              {task.progress ? (
                <Text style={styles.progress}>
                  {task.progress.step} / {task.progress.of}
                </Text>
              ) : null}
              <Button
                variant="ghost"
                label={strings.common.cancel}
                onPress={onCancel}
              />
            </>
          ) : null}

          {task.type === 'card' ? (
            <>
              <Title>{strings.supervisor.addCard}</Title>
              <Body>{strings.supervisor.tapCardNow}</Body>
              <Button
                variant="ghost"
                label={strings.common.cancel}
                onPress={onCancel}
              />
            </>
          ) : null}

          {task.type === 'saving' ? (
            <Body>{strings.supervisor.saving}</Body>
          ) : null}

          {task.type === 'done' ? (
            <>
              <Title style={styles.done}>{task.message}</Title>
              <Button label={strings.common.confirm} onPress={onCancel} />
            </>
          ) : null}

          {task.type === 'error' ? (
            <>
              <Text style={styles.error}>{task.message}</Text>
              <Button
                variant="secondary"
                label={strings.common.confirm}
                onPress={onCancel}
              />
            </>
          ) : null}
        </Card>
      </TaskBackdrop>
    </Modal>
  );
}

function TaskBackdrop({ children }: { children: React.ReactNode }) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  return (
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
      {children}
    </ScrollView>
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
  topText: { flex: 1 },
  steps: { gap: 2 },
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
  },
  list: { flex: 1, gap: space.md },
  listContent: { gap: space.sm, paddingBottom: space.xl },
  search: {
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
  employee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  employeePressed: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  employeeName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    color: colors.foreground,
  },
  badges: {
    maxWidth: '45%',
    flexDirection: 'row',
    gap: space.xs,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  detail: { gap: space.lg, paddingBottom: space.xxl },
  back: { alignSelf: 'flex-start' },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  whoText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.heading, fontSize: 24, color: colors.foreground },
  nameCompact: { fontSize: 20 },
  eid: { fontFamily: fonts.mono, fontSize: 14, color: colors.mutedForeground },
  section: { gap: space.md },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.foreground,
  },
  itemRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  itemLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.foreground,
  },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  backdropContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { width: '100%', maxWidth: 560, gap: space.lg },
  fingerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fingerButton: { flexBasis: '47%', flexGrow: 1, minHeight: 56 },
  progress: {
    fontFamily: fonts.monoBold,
    fontSize: 32,
    color: colors.brand,
    textAlign: 'center',
  },
  done: { color: colors.success },
  error: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    color: colors.destructive,
  },
});
