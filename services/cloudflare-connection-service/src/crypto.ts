const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function ticketKey(operatorToken: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(
      `our-poker-table/cloudflare-relay/ticket-key/${operatorToken}`,
    ),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export interface EncryptedSecret {
  readonly ciphertext: string;
  readonly iv: string;
}

export async function encryptTicket(
  operatorToken: string,
  ticket: string,
): Promise<EncryptedSecret> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    await ticketKey(operatorToken),
    encoder.encode(ticket),
  );
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
    iv: bytesToBase64Url(iv),
  };
}

export async function decryptTicket(
  operatorToken: string,
  secret: EncryptedSecret,
): Promise<string | undefined> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        iv: base64UrlToBytes(secret.iv) as unknown as BufferSource,
        name: "AES-GCM",
      },
      await ticketKey(operatorToken),
      base64UrlToBytes(secret.ciphertext) as unknown as BufferSource,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return undefined;
  }
}
