import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { colors, fonts } from '../../theme';
import { strings } from '../../i18n/strings';
import type { FacePreviewProps } from '../types';
import { ensureCameraPermission } from './permissions';

/** Front camera preview (CameraX) used by the simulated face engine. */
export function CameraPreview({ style, active }: FacePreviewProps) {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureCameraPermission().then(ok => mounted && setGranted(ok));
    return () => {
      mounted = false;
    };
  }, []);

  if (!granted || !active) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>
          {granted === false ? strings.camera.permissionDenied : ''}
        </Text>
      </View>
    );
  }

  return (
    <Camera
      style={[styles.camera, style]}
      cameraType={CameraType.Front}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.night,
  },
  placeholderText: {
    color: colors.nightMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlign: 'center',
    padding: 24,
  },
});
