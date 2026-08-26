import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHmacSha256 } from '../src/security/webhook-signature.js';
describe('verifyHmacSha256', () => { it('accepts valid and rejects invalid signatures', () => { const body='{"ok":true}', secret='a'.repeat(32); const sig=createHmac('sha256',secret).update(body).digest('hex'); expect(verifyHmacSha256(body,sig,secret)).toBe(true); expect(verifyHmacSha256(body,'bad',secret)).toBe(false); }); });
