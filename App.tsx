import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { KioskProvider, useKioskData, useKiosk } from './src/app/context';
import { KioskService } from './src/app/kioskService';
import { PairingScreen } from './src/screens/PairingScreen';
import { TerminalScreen } from './src/screens/TerminalScreen';
import { strings } from './src/i18n/strings';
import { colors } from './src/theme';

let service: KioskService | null = null;
function getService() {
  service ??= new KioskService();
  return service;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <KioskProvider service={getService()}>
        <SafeAreaView
          style={styles.root}
          edges={['top', 'bottom', 'left', 'right']}
        >
          <Root />
        </SafeAreaView>
      </KioskProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const kiosk = useKiosk();
  const data = useKioskData();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    kiosk.init().catch(() => undefined);
    return kiosk.onRevoked(() => setNotice(strings.pairing.revoked));
  }, [kiosk]);

  if (!data.loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  return data.pairing ? <TerminalScreen /> : <PairingScreen notice={notice} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
