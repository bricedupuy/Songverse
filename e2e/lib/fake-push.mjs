// A stand-in push service (issue #236), as Google's or Mozilla's would be
// for a browser: the API is allowed to post to it through PUSH_TEST_ORIGINS.
// It keeps each push it gets, decrypted (RFC 8291, aes128gcm) with the
// keys of the device it was for - devices made here with `device()` - so a
// suite reads what the device would show. A device whose path has "gone"
// in it answers 410, as for a browser that unsubscribed.
import { createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const FAKE_PUSH_PORT = Number(process.env.FAKE_PUSH_PORT ?? 3997);
export const FAKE_PUSH_URL = `http://localhost:${FAKE_PUSH_PORT}`;

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** A device's push subscription, with its private half kept here to read what it's sent. */
export function device(name) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `${FAKE_PUSH_URL}/push/${name}-${randomBytes(4).toString("hex")}`;
  return { endpoint, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(auth) }, ecdh, auth };
}

/** RFC 8291: the plaintext of an aes128gcm push for a device. */
function decrypt(body, dev) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const serverPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const secret = dev.ecdh.computeSecret(serverPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), dev.ecdh.getPublicKey(), serverPublic, Buffer.from([1])]);
  const ikm = hmac(hmac(dev.auth, secret), keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  // The last record: its text, then 0x02, then padding.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  return padded.subarray(0, end).toString("utf8");
}

/** Starts it; `pushes` is what it got, `for(dev)` the pushes a device got, decrypted. */
export async function startFakePush() {
  const devices = new Map();
  const pushes = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const dev = devices.get(req.url);
      let message = null;
      try {
        message = dev ? JSON.parse(decrypt(body, dev)) : null;
      } catch (error) {
        message = { error: String(error) };
      }
      pushes.push({ path: req.url, method: req.method, headers: req.headers, message });
      res.writeHead(req.url.includes("gone") ? 410 : 201).end();
    });
  });
  await new Promise((resolve) => server.listen(FAKE_PUSH_PORT, resolve));
  return {
    pushes,
    /** A device it knows the keys of. */
    device(name) {
      const dev = device(name);
      devices.set(new URL(dev.endpoint).pathname, dev);
      return dev;
    },
    for: (dev) => pushes.filter((push) => push.path === new URL(dev.endpoint).pathname),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
