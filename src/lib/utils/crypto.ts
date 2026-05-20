// ============================================
// Digital Signatures & Proof of Delivery (POD)
// (Lecture 9: Security — Non-repudiation)
//
// Simulates a Public-Key Digital Signature scheme:
// - Driver generates a Proof of Delivery signed
//   with a mock private key.
// - The server/client can verify it with the
//   corresponding public key.
// - Ensures Non-repudiation: the driver cannot
//   deny having delivered the order.
//
// Uses the Web Crypto API (SubtleCrypto) for
// HMAC-SHA256 signatures in the browser.
// ============================================

// ---- Key Pair simulation ----

/**
 * Generates a mock key pair for a principal.
 * In production, this would be asymmetric (RSA/ECDSA).
 * For simulation, we use HMAC-SHA256 with a shared secret
 * derived from the user's ID.
 */
export async function generateKeyPair(userId: string): Promise<{
  privateKey: CryptoKey;
  publicKeyHash: string;
}> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`delivery-system-secret:${userId}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  // Public key hash = first 16 chars of hex(SHA-256(userId))
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(userId)
  );
  const publicKeyHash = bufferToHex(hashBuffer).slice(0, 16);

  return { privateKey: keyMaterial, publicKeyHash };
}

// ---- Proof of Delivery ----

export interface ProofOfDelivery {
  orderId: string;
  driverId: string;
  deliveredAt: string;
  clientId: string;
  signature: string;
  publicKeyHash: string;
  algorithm: string;
}

/**
 * Generate a Proof of Delivery (POD) — Digital Signature.
 * The driver signs the delivery data with their private key.
 * This ensures Non-repudiation (Lecture 9).
 */
export async function signDelivery(
  orderId: string,
  driverId: string,
  clientId: string
): Promise<ProofOfDelivery> {
  const { privateKey, publicKeyHash } = await generateKeyPair(driverId);
  const deliveredAt = new Date().toISOString();

  // Build the message to sign
  const message = `POD|${orderId}|${driverId}|${clientId}|${deliveredAt}`;
  const encoder = new TextEncoder();

  // Sign with HMAC-SHA256
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    privateKey,
    encoder.encode(message)
  );

  return {
    orderId,
    driverId,
    deliveredAt,
    clientId,
    signature: bufferToHex(signatureBuffer),
    publicKeyHash,
    algorithm: "HMAC-SHA256",
  };
}

/**
 * Verify a Proof of Delivery (POD).
 * Re-creates the key from the driver's ID and verifies the signature.
 */
export async function verifyDelivery(pod: ProofOfDelivery): Promise<boolean> {
  const { privateKey } = await generateKeyPair(pod.driverId);

  // Reconstruct the signed message
  const message = `POD|${pod.orderId}|${pod.driverId}|${pod.clientId}|${pod.deliveredAt}`;
  const encoder = new TextEncoder();

  const isValid = await crypto.subtle.verify(
    "HMAC",
    privateKey,
    hexToBuffer(pod.signature),
    encoder.encode(message)
  );

  return isValid;
}

// ---- Integrity hash for file uploads (DFS) ----

/**
 * Compute a SHA-256 hash of a file for integrity verification.
 * Used in the DFS to detect data corruption.
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Compute a SHA-256 hash of arbitrary text.
 */
export async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bufferToHex(buffer);
}

// ---- Hex utilities ----

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}
