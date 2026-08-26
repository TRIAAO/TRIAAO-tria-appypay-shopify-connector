import type { PrismaClient } from '@prisma/client';
import type { Config } from '../config.js';
import { encryptSecret, normalizeShop } from '../security/shopify-auth.js';

interface TokenResponse { access_token: string; scope: string; }
export class ShopifyOauthService {
  constructor(private readonly config: Config, private readonly prisma: PrismaClient) {}
  authorizationUrl(shopInput: string, state: string): string {
    const shop = normalizeShop(shopInput), params = new URLSearchParams({ client_id: this.config.SHOPIFY_API_KEY!, scope: this.config.SHOPIFY_SCOPES ?? '', redirect_uri: `${this.config.APP_BASE_URL}/auth/shopify/callback`, state });
    return `https://${shop}/admin/oauth/authorize?${params}`;
  }
  async exchangeCode(shopInput: string, code: string): Promise<void> {
    const shop = normalizeShop(shopInput);
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({client_id:this.config.SHOPIFY_API_KEY,client_secret:this.config.SHOPIFY_API_SECRET,code}) });
    if (!response.ok) throw new Error(`SHOPIFY_TOKEN_EXCHANGE_${response.status}`);
    const token = await response.json() as TokenResponse;
    await this.prisma.merchant.upsert({ where:{shopDomain:shop}, update:{active:true,shopifyTokenEncrypted:encryptSecret(token.access_token,this.config.APP_ENCRYPTION_KEY!),shopifyScopes:token.scope,installedAt:new Date()}, create:{shopDomain:shop,active:true,shopifyTokenEncrypted:encryptSecret(token.access_token,this.config.APP_ENCRYPTION_KEY!),shopifyScopes:token.scope,installedAt:new Date()} });
  }
  async listInstallations() {
    return this.prisma.merchant.findMany({
      select: { shopDomain:true, active:true, shopifyScopes:true, installedAt:true },
      orderBy: { installedAt:'desc' }
    });
  }
}
