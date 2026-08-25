import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, normalizeShop, verifyShopifyHmac } from '../src/security/shopify-auth.js';
describe('Shopify auth security',()=>{
  it('accepts only canonical myshopify domains',()=>{expect(normalizeShop('Spaccio-Angola.myshopify.com')).toBe('spaccio-angola.myshopify.com');expect(()=>normalizeShop('evil.example.com')).toThrow('INVALID_SHOP')});
  it('verifies callback HMAC',()=>{const secret='secret',query={code:'abc',shop:'store.myshopify.com',state:'xyz'};const message='code=abc&shop=store.myshopify.com&state=xyz';const hmac=createHmac('sha256',secret).update(message).digest('hex');expect(verifyShopifyHmac({...query,hmac},secret)).toBe(true);expect(verifyShopifyHmac({...query,hmac:'0'.repeat(64)},secret)).toBe(false)});
  it('encrypts access tokens with AES-256-GCM',()=>{const key=randomBytes(32).toString('base64'),encrypted=encryptSecret('shpat_secret',key);expect(encrypted).not.toContain('shpat_secret');expect(decryptSecret(encrypted,key)).toBe('shpat_secret')});
});
