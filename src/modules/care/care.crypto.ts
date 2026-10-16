/**
 * Seals the safety plan at rest (PED-10): AES-256-GCM with a fresh 96-bit IV per write, under a key
 * derived from AUTH_SECRET with HKDF-SHA-256 and the label "safety-plan", so the plan's key is
 * never the key that signs codes. The stored form is `v1.<iv>.<ciphertext and tag>` in base64url.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const encoder = new TextEncoder();

/** The safety plan's key under `secret`. */
export async function deriveSafetyPlanKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('kira-care'),
      info: encoder.encode('safety-plan'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** `plaintext` sealed under `key`. */
export async function seal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return [
    VERSION,
    Buffer.from(iv).toString('base64url'),
    Buffer.from(sealed).toString('base64url'),
  ].join('.');
}

/** The plaintext of `sealed`; throws when it was not sealed under `key` or was changed. */
export async function open(key: CryptoKey, sealed: string): Promise<string> {
  const [version, iv, body] = sealed.split('.');
  if (version !== VERSION || iv === undefined || body === undefined) {
    throw new Error('Not a sealed safety plan');
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64url') },
    key,
    Buffer.from(body, 'base64url'),
  );
  return new TextDecoder().decode(plain);
}
