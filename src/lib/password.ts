const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const ALGORITHM = "pbkdf2_sha256";

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(str: string): ArrayBuffer {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_LENGTH * 8
  );
  return `${ALGORITHM}$${ITERATIONS}$${bufToBase64(salt.buffer)}$${bufToBase64(hash)}`;
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) {
    return false;
  }
  const [, iterationsStr, saltB64, hashB64] = parts;
  const iterations = parseInt(iterationsStr, 10);
  const salt = base64ToBuf(saltB64);
  const expectedHash = base64ToBuf(hashB64);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const actualHash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    expectedHash.byteLength * 8
  );

  if (actualHash.byteLength !== expectedHash.byteLength) {
    return false;
  }
  const actual = new Uint8Array(actualHash);
  const expected = new Uint8Array(expectedHash);
  let match = 0;
  for (let i = 0; i < actual.length; i++) {
    match |= actual[i] ^ expected[i];
  }
  return match === 0;
}
