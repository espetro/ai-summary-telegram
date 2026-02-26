import crypto from 'crypto';

/**
 * Derive a 32-byte user key from master secret using HKDF-SHA256
 * @param masterSecret - The master secret (32 bytes recommended)
 * @param salt - Salt (16 bytes recommended)
 * @returns 32-byte derived key
 */
export function deriveUserKey(masterSecret: Buffer, salt: Buffer): Buffer {
  if (masterSecret.length !== 32) {
    throw new Error('masterSecret must be 32 bytes');
  }
  if (salt.length !== 16) {
    throw new Error('salt must be 16 bytes');
  }

  return Buffer.from(crypto.hkdfSync(
    'sha256',
    masterSecret,
    salt,
    'cib-user-key',
    32
  ));
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext - The string to encrypt
 * @param key - 32-byte encryption key
 * @returns Buffer containing [IV || ciphertext || authTag]
 */
export function encrypt(plaintext: string, key: Buffer): Buffer {
  if (key.length !== 32) {
    throw new Error('key must be 32 bytes');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return: IV (16 bytes) || ciphertext || authTag
  return Buffer.concat([iv, encrypted, authTag]);
}

/**
 * Decrypt ciphertext that was encrypted with encrypt()
 * @param ciphertext - Buffer containing [IV || ciphertext || authTag]
 * @param key - 32-byte decryption key
 * @returns Decrypted plaintext string
 */
export function decrypt(ciphertext: Buffer, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('key must be 32 bytes');
  }
  if (ciphertext.length < 32) {
    throw new Error('ciphertext too short');
  }

  // Extract components
  const iv = ciphertext.slice(0, 16);
  const encrypted = ciphertext.slice(16, ciphertext.length - 16);
  const authTag = ciphertext.slice(ciphertext.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString('utf8');
}
