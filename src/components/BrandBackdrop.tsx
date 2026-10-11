import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { brandAccentBar, brandSurface } from '../theme';

/**
 * Rona brand surface (gradient + wave line art + accent bar), as on the web
 * kiosk. Render it first inside a screen so the content paints over it.
 */
export function BrandBackdrop() {
  return (
    <View style={styles.surface} pointerEvents="none">
      <Image
        source={require('../../assets/images/rona-waves.webp')}
        style={styles.waves}
        resizeMode="cover"
      />
      <View style={styles.accentBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    ...StyleSheet.absoluteFill,
    backgroundImage: brandSurface,
  },
  waves: { ...StyleSheet.absoluteFill, opacity: 0.12 },
  accentBar: { height: 4, backgroundImage: brandAccentBar },
});
