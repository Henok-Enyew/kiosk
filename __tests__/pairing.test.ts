import { ApiError, NetworkError } from '../src/api/client';
import {
  describePairingError,
  isLoopbackUrl,
  normalizePairingUrl,
  pairingUrlWarnings,
} from '../src/app/pairing';
import { strings } from '../src/i18n/strings';
import { computeLayout } from '../src/theme/layout';

describe('pairing helpers', () => {
  test('normalizes addresses typed without a scheme', () => {
    expect(normalizePairingUrl(' api.rona.pro.et/api/ ')).toBe(
      'https://api.rona.pro.et',
    );
    expect(normalizePairingUrl('http://10.0.0.2:8000')).toBe(
      'http://10.0.0.2:8000',
    );
  });

  test('detects loopback addresses', () => {
    expect(isLoopbackUrl('http://localhost:8000')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:8000/api')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:8000')).toBe(true);
    expect(isLoopbackUrl('https://api.rona.pro.et')).toBe(false);
    expect(isLoopbackUrl('http://192.168.1.4:8000')).toBe(false);
  });

  test('warns about localhost and blocked http before pairing', () => {
    expect(pairingUrlWarnings('https://api.rona.pro.et', false)).toEqual([]);
    expect(pairingUrlWarnings('http://localhost:8000', true)).toEqual([
      strings.pairing.loopback,
    ]);
    expect(pairingUrlWarnings('http://localhost:8000', false)).toEqual([
      strings.pairing.cleartextBlocked,
      strings.pairing.loopback,
    ]);
  });

  test('a 404 on register means the server has no kiosk API', () => {
    const message = describePairingError(
      new ApiError(404, 'Cannot POST /api/kiosk/device/register'),
      'https://api.rona.pro.et',
      false,
    );
    expect(message).toContain(strings.pairing.notSupported);
    expect(message).toContain('https://api.rona.pro.et');
    expect(message).not.toContain('Cannot POST');
  });

  test('unreachable localhost explains adb reverse', () => {
    const message = describePairingError(
      new NetworkError(),
      'http://localhost:8000',
      true,
    );
    expect(message).toContain(strings.pairing.unreachable);
    expect(message).toContain('adb reverse');
    expect(message).toContain(strings.pairing.tried('http://localhost:8000'));
  });

  test('a rejected credential keeps the server reason', () => {
    const message = describePairingError(
      new ApiError(401, 'Invalid kiosk credential.'),
      'https://api.rona.pro.et',
      false,
    );
    expect(message).toContain('Invalid kiosk credential.');
    expect(message).toContain(strings.pairing.rejectedHint);
  });
});

describe('layout', () => {
  test('a 360 dp phone is compact and scaled down', () => {
    const phone = computeLayout(360, 800);
    expect(phone.compact).toBe(true);
    expect(phone.landscape).toBe(false);
    expect(phone.s(132)).toBeLessThan(132);
  });

  test('an 8" terminal in landscape is not compact', () => {
    const terminal = computeLayout(1280, 800);
    expect(terminal.compact).toBe(false);
    expect(terminal.landscape).toBe(true);
    expect(terminal.s(100)).toBeGreaterThanOrEqual(100);
  });
});
