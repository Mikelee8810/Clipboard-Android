import * as SecureStore from 'expo-secure-store';

/**
 * Automatic space secret.
 *
 * The user never sees or types a passphrase. The device that creates a space
 * generates a random secret, keeps it in secure storage, and appends it to every
 * invitation it issues. A joining device reads the secret out of the pairing
 * code, so pairing is a single code: `NNN-NNN-XXXXXXXXXX`.
 */

const STORE_KEY = 'space_secret_v1';
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
/** Unambiguous uppercase alphabet (no 0/O/1/I). Must match the desktop app. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SECRET_LENGTH = 10;
export const PAIRING_CODE_LENGTH = 6 + SECRET_LENGTH;

export function generateSpaceSecret(): string {
  let out = '';
  for (let i = 0; i < SECRET_LENGTH; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export async function loadSpaceSecret(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(STORE_KEY, STORE_OPTIONS);
  return value && value.trim() ? value.trim() : null;
}

export async function storeSpaceSecret(secret: string): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, secret, STORE_OPTIONS);
}

export async function loadOrCreateSpaceSecret(): Promise<string> {
  const existing = await loadSpaceSecret();
  if (existing) return existing;
  const secret = generateSpaceSecret();
  await storeSpaceSecret(secret);
  return secret;
}

export function cleanPairingCode(raw: string): string {
  return raw.normalize('NFKC').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

export function isPairingCodeComplete(raw: string): boolean {
  const clean = cleanPairingCode(raw);
  return clean.length === PAIRING_CODE_LENGTH && /^\d{6}[A-Z2-9]{10}$/.test(clean);
}

/** Display form: `NNN-NNN-XXXXXXXXXX` (partial input formats progressively). */
export function formatPairingCode(raw: string): string {
  const clean = cleanPairingCode(raw);
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, PAIRING_CODE_LENGTH)}`;
}

export function combinePairingCode(engineCode: string, secret: string): string {
  return `${engineCode}-${secret}`;
}

/** Split a pairing code into the engine invitation (`NNN-NNN`) and the secret. */
export function splitPairingCode(raw: string): { engineCode: string; secret: string } | null {
  if (!isPairingCodeComplete(raw)) return null;
  const clean = cleanPairingCode(raw);
  return {
    engineCode: `${clean.slice(0, 3)}-${clean.slice(3, 6)}`,
    secret: clean.slice(6),
  };
}
