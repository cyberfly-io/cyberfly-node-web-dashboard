import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

const KEYPAIR_STORAGE_KEY = 'cyberfly_keypair';

/**
 * Generate a new Ed25519 keypair (32-byte secret key, Kadena-compatible)
 * Kadena uses only the first 32 bytes (seed) of the secret key
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.sign.keyPair();
  
  // Kadena style: slice secretKey to first 64 hex chars (32 bytes)
  // This is the seed portion, not the full 64-byte nacl secret key
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    secretKey: Buffer.from(keyPair.secretKey).toString('hex').slice(0, 64), // 32 bytes (64 hex chars)
  };
}

/**
 * Save keypair to localStorage
 */
export function saveKeyPair(keyPair: KeyPair): void {
  localStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(keyPair));
}

/**
 * Load keypair from localStorage
 */
export function loadKeyPair(): KeyPair | null {
  const stored = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Delete keypair from localStorage
 */
export function deleteKeyPair(): void {
  localStorage.removeItem(KEYPAIR_STORAGE_KEY);
}

/**
 * Sign data with Ed25519 secret key (32-byte seed, Kadena-compatible)
 */
export function signData(data: any, secretKeyHex: string): string {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  const messageBytes = Buffer.from(message, 'utf-8');
  
  // If secretKey is 32 bytes (64 hex chars), we need to reconstruct the full keypair from seed
  const secretKeyBytes = Buffer.from(secretKeyHex, 'hex');
  
  let fullSecretKey: Uint8Array;
  if (secretKeyBytes.length === 32) {
    // Reconstruct keypair from seed (Kadena style)
    const keyPair = nacl.sign.keyPair.fromSeed(secretKeyBytes);
    fullSecretKey = keyPair.secretKey;
  } else if (secretKeyBytes.length === 64) {
    // Full secret key provided
    fullSecretKey = secretKeyBytes;
  } else {
    throw new Error('Invalid secret key length');
  }
  
  const signature = nacl.sign.detached(messageBytes, fullSecretKey);
  return Buffer.from(signature).toString('hex');
}

/**
 * Verify signature with Ed25519 public key (32-byte)
 */
export function verifySignature(
  data: any,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    const messageBytes = Buffer.from(message, 'utf-8');
    const signature = Buffer.from(signatureHex, 'hex');
    const publicKey = Buffer.from(publicKeyHex, 'hex'); // 32-byte public key
    
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Check if keypair exists in localStorage
 */
export function hasKeyPair(): boolean {
  return localStorage.getItem(KEYPAIR_STORAGE_KEY) !== null;
}
