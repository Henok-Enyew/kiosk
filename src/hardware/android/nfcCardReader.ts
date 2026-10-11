import { CardReader } from '../../native';
import type { CardReaderEngine } from '../types';

/** Android NFC reader mode (phones and terminals with an Android-visible NFC reader). */
export function createNfcCardReader(): CardReaderEngine | null {
  if (!CardReader.isAvailable()) return null;
  return {
    status: () => (CardReader.isEnabled() ? 'READY' : 'UNAVAILABLE'),
    listen(onCard) {
      const subscription = CardReader.onCard(event => onCard(event.uid));
      CardReader.start();
      return () => {
        subscription.remove();
        CardReader.stop();
      };
    },
  };
}
