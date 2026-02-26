import { test, expect } from 'bun:test';
import { deriveUserKey, encrypt, decrypt } from '../index';

const MASTER_SECRET = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
const SALT_1 = Buffer.from('a1b2c3d4e5f67890a1b2c3d4e5f67890', 'hex');
const SALT_2 = Buffer.from('f6e5d4c3b2a109876543210987654321', 'hex');
const PLAINTEXT = 'This is a secret message';

test('roundtrip encryption/decryption should return original plaintext', () => {
  const key = deriveUserKey(MASTER_SECRET, SALT_1);
  const encrypted = encrypt(PLAINTEXT, key);
  const decrypted = decrypt(encrypted, key);

  expect(decrypted).toBe(PLAINTEXT);
});

test('different salts should produce different derived keys', () => {
  const key1 = deriveUserKey(MASTER_SECRET, SALT_1);
  const key2 = deriveUserKey(MASTER_SECRET, SALT_2);

  expect(Buffer.compare(key1, key2)).not.toBe(0);

  const encrypted = encrypt(PLAINTEXT, key1);
  expect(() => decrypt(encrypted, key2)).toThrow();

  const decrypted = decrypt(encrypted, key1);
  expect(decrypted).toBe(PLAINTEXT);
});

test('tampered ciphertext should fail to decrypt', () => {
  const key = deriveUserKey(MASTER_SECRET, SALT_1);
  const encrypted = encrypt(PLAINTEXT, key);

  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] = tampered[tampered.length - 1] === 0 ? 1 : 0;

  expect(() => decrypt(tampered, key)).toThrow();
});
