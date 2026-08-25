import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const supplied = signature.replace(/^sha256=/, '');
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
