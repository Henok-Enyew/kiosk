import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Thin bar that empties over `durationMs`; calls onDone at the end. */
export function CountdownBar({
  durationMs,
  onDone,
  color = colors.brand,
}: {
  durationMs: number;
  onDone: () => void;
  color?: string;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    progress.setValue(1);
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => finished && done.current());
    return () => animation.stop();
  }, [durationMs, progress]);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
});
