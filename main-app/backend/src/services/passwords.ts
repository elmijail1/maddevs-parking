import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const keyLength = 64;
const options = { N: 16384, r: 8, p: 1 };

function deriveKey(password: string, salt: Buffer, scryptOptions: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keyLength, scryptOptions, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, options);
  return ["scrypt", options.N, options.r, options.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, N, r, p, salt, key] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }
  const expected = Buffer.from(key, "base64");
  const actual = await deriveKey(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const dummyHash = await hashPassword(randomBytes(16).toString("hex"));

export async function verifyAgainstNothing(password: string) {
  await verifyPassword(password, dummyHash);
  return false;
}
