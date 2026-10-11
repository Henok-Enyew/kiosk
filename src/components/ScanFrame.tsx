import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Corner brackets and a sweeping line over the camera, like the web kiosk. */
export function ScanFrame({
  active,
  tone = colors.scan,
}: {
  active: boolean;
  tone?: string;
}) {
  const sweep = useRef(new Animated.Value(0)).current;
  // Fits the brackets into whatever box the frame sits in (small phones, landscape).
  const [size, setSize] = useState(FRAME_SIZE);

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, sweep]);

  return (
    <View
      pointerEvents="none"
      style={styles.overlay}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setSize(
          Math.round(
            Math.max(80, Math.min(FRAME_SIZE, width * 0.7, (height * 0.8) / 1.15)),
          ),
        );
      }}
    >
      <View style={{ width: size, height: size * 1.15 }}>
        {CORNERS.map(corner => (
          <View
            key={corner}
            style={[styles.corner, cornerStyle(corner), { borderColor: tone }]}
          />
        ))}
        {active ? (
          <Animated.View
            style={[
              styles.line,
              { backgroundColor: tone },
              {
                transform: [
                  {
                    translateY: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, size * 1.15 - 4],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const FRAME_SIZE = 240;
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

function cornerStyle(corner: (typeof CORNERS)[number]) {
  const base = {
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  };
  switch (corner) {
    case 'tl':
      return {
        ...base,
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 18,
      };
    case 'tr':
      return {
        ...base,
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 18,
      };
    case 'bl':
      return {
        ...base,
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 18,
      };
    case 'br':
      return {
        ...base,
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 18,
      };
  }
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', width: 44, height: 44 },
  line: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 3,
    borderRadius: 2,
    opacity: 0.8,
  },
});
