import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const shopPattern = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export const normalizeShop = (value: string): string => {
  const shop = value.trim().toLowerCase();
  if (!shopPattern.test(shop)) throw new Error('INVALID_SHOP');
  return shop;
};

export function verifyShopifyHmac(query: Record<string, unknown>, secret: string): boolean {
  const supplied = typeof query.hmac === 'string' ? query.hmac : '';
  const message = Object.entries(query).filter(([key]) => key !== 'hmac' && key !== 'signature').sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`).join('&');
  const expected = createHmac('sha256', secret).update(message).digest('hex');
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export const newOauthState = (): string => randomBytes(24).toString('hex');
export function encryptSecret(value: string, base64Key: string): string {
  const key = Buffer.from(base64Key, 'base64'), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptSecret(value: string, base64Key: string): string {
  const [iv, tag, encrypted] = value.split('.'); if (!iv || !tag || !encrypted) throw new Error('INVALID_CIPHERTEXT');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(base64Key, 'base64'), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}
