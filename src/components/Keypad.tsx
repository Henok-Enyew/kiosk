import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space, TOUCH_TARGET } from '../theme';
import { useLayout } from '../theme/layout';

interface KeypadProps {
  length: number;
  onComplete: (value: string) => void;
  /** Masks digits (PINs). */
  secure?: boolean;
  disabled?: boolean;
  /** Changing this key clears the entry (e.g. after a wrong PIN). */
  resetKey?: number;
}

const KEY_WIDTH = 96;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** On-screen numeric keypad — the terminal never shows the soft keyboard. */
export function Keypad({
  length,
  onComplete,
  secure,
  disabled,
  resetKey,
}: KeypadProps) {
  const [value, setValue] = useState('');
  const layout = useLayout();
  // Fit the keys and slots into the width the keypad actually gets.
  const [available, setAvailable] = useState(KEY_WIDTH * 3 + space.md * 2);
  const keyWidth = Math.floor(
    Math.min(KEY_WIDTH, (available - space.md * 2) / 3),
  );
  const keyHeight = layout.height < 640 ? 52 : TOUCH_TARGET + 8;
  const slotWidth = Math.floor(
    Math.min(48, (available - space.sm * (length - 1)) / length),
  );

  useEffect(() => setValue(''), [resetKey]);

  const press = (key: string) => {
    if (disabled) return;
    if (key === '⌫') {
      setValue(current => current.slice(0, -1));
      return;
    }
    if (!key) return;
    setValue(current => {
      const next = (current + key).slice(0, length);
      if (next.length === length) setTimeout(() => onComplete(next), 0);
      return next;
    });
  };

  return (
    <View
      style={[styles.wrap, layout.height < 640 && styles.wrapShort]}
      onLayout={event => setAvailable(event.nativeEvent.layout.width)}
    >
      <View style={styles.slots}>
        {Array.from({ length }, (_, index) => {
          const char = value[index];
          return (
            <View
              key={index}
              style={[
                styles.slot,
                { width: slotWidth, height: Math.round(slotWidth * 1.25) },
                index === value.length && styles.slotActive,
              ]}
            >
              <Text style={styles.slotText}>
                {char ? (secure ? '•' : char) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={[styles.grid, { width: keyWidth * 3 + space.md * 2 }]}>
        {KEYS.map((key, index) => (
          <Pressable
            key={index}
            disabled={!key || disabled}
            accessibilityLabel={key === '⌫' ? 'Delete' : key}
            onPress={() => press(key)}
            style={({ pressed }) => [
              styles.key,
              { width: keyWidth, height: keyHeight },
              !key && styles.keyHidden,
              pressed && styles.keyPressed,
            ]}
          >
            <Text
              style={[styles.keyText, key === '⌫' && styles.keyTextSymbol]}
            >
              {key}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xl, alignSelf: 'stretch' },
  wrapShort: { gap: space.md },
  slots: { flexDirection: 'row', gap: space.sm },
  slot: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActive: { borderColor: colors.brand },
  slotText: {
    fontFamily: fonts.monoBold,
    fontSize: 26,
    color: colors.foreground,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  key: {
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyHidden: { opacity: 0 },
  keyPressed: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  keyText: {
    fontFamily: fonts.monoMedium,
    fontSize: 28,
    color: colors.foreground,
  },
  // JetBrains Mono has no ⌫; Inter does.
  keyTextSymbol: { fontFamily: fonts.bodyMedium },
});
