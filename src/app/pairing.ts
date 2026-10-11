import { ApiError, NetworkError, normalizeBaseUrl } from '../api/client';
import { strings } from '../i18n/strings';

/** Accepts "api.example.com" as well as full URLs; defaults to https. */
export function normalizePairingUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return normalizeBaseUrl(withScheme);
}

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(
    url.trim(),
  );
  return match ? match[1].toLowerCase() : '';
}

/** localhost & co. — reachable from a phone only through `adb reverse`. */
export function isLoopbackUrl(url: string): boolean {
  const host = hostOf(url);
  return (
    host === 'localhost' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    /^127\./.test(host)
  );
}

export function isCleartextUrl(url: string): boolean {
  return /^http:\/\//i.test(url.trim());
}

/** Warnings shown before pairing, for the address being used. */
export function pairingUrlWarnings(
  url: string,
  allowsCleartext: boolean,
): string[] {
  if (!url.trim()) return [];
  const warnings: string[] = [];
  if (isCleartextUrl(url) && !allowsCleartext) {
    warnings.push(strings.pairing.cleartextBlocked);
  }
  if (isLoopbackUrl(url)) warnings.push(strings.pairing.loopback);
  return warnings;
}

/** Turns a failed pairing into a message an installer can act on. */
export function describePairingError(
  cause: unknown,
  url: string,
  allowsCleartext: boolean,
): string {
  const tried = strings.pairing.tried(url);
  if (cause instanceof NetworkError) {
    const reasons = pairingUrlWarnings(url, allowsCleartext);
    return [strings.pairing.unreachable, ...reasons, tried].join('\n\n');
  }
  if (cause instanceof ApiError) {
    if (cause.statusCode === 404 || cause.statusCode === 405) {
      return [strings.pairing.notSupported, tried].join('\n\n');
    }
    if (cause.statusCode === 429) {
      return [strings.errors.tooMany, tried].join('\n\n');
    }
    if (cause.statusCode >= 500) {
      return [strings.pairing.serverError, tried].join('\n\n');
    }
    return [
      strings.pairing.rejected(cause.message),
      strings.pairing.rejectedHint,
      tried,
    ].join('\n\n');
  }
  const message = cause instanceof Error ? cause.message : '';
  return [message || strings.errors.generic, tried].join('\n\n');
}
