import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { RealAppyPayProvider } from '../src/providers/appypay-real.js';

const config = loadConfig({
  NODE_ENV:'test', DATABASE_URL:'postgresql://test', APP_BASE_URL:'https://connector.test',
  APPYPAY_MODE:'sandbox', APPYPAY_BASE_URL:'https://gateway.test', APPYPAY_TOKEN_URL:'https://login.test/token',
  APPYPAY_CLIENT_ID:'client', APPYPAY_CLIENT_SECRET:'secret', APPYPAY_RESOURCE:'resource',
  APPYPAY_PAYMENT_METHOD_GPO:'GPO_test', APPYPAY_PAYMENT_METHOD_REF:'REF_test',
  APPYPAY_WEBHOOK_SECRET:'x'.repeat(32),
});
const input = { merchantId:'shop.myshopify.com', shopifySessionId:'session-1', idempotencyKey:'idem-key-123', method:'MULTICAIXA_EXPRESS' as const, amountMinor:9998, currency:'AOA' as const, customer:{name:'Cliente',phone:'+244900000000'}, returnUrl:'https://connector.test/return' };

afterEach(()=>vi.unstubAllGlobals());
describe('RealAppyPayProvider',()=>{
  it('gets and reuses a bearer token while creating GPO charges',async()=>{
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:'charge-1',responseStatus:{successful:true,status:'Success',code:100,message:'OK',source:'GPO'}}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:'charge-2',responseStatus:{successful:false,status:'Pending',code:101,message:'Pending',source:'GPO'}}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const provider=new RealAppyPayProvider(config);
    expect((await provider.createPayment(input)).status).toBe('PAID');
    expect((await provider.createPayment({...input,idempotencyKey:'idem-key-456'})).status).toBe('PENDING');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const request=JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(request.amount).toBe(99.98);
    expect(request.paymentMethod).toBe('GPO_test');
    expect(request.paymentInfo.phoneNumber).toBe('244900000000');
    expect(request.merchantTransactionId).toMatch(/^[A-F0-9]{15}$/);
  });
  it('maps a reference response',async()=>{
    vi.stubGlobal('fetch',vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:'charge-ref',responseStatus:{successful:true,status:'Requested',code:0,message:'Requested',source:'REF'},reference:{referenceNumber:'300037493',dueDate:'2026-09-01T10:00:00Z'}}),{status:200})));
    const result=await new RealAppyPayProvider(config).createPayment({...input,method:'REFERENCE'});
    expect(result).toMatchObject({providerPaymentId:'charge-ref',status:'PENDING',reference:'300037493'});
  });
  it('parses GPO and REF webhook status safely',()=>{
    const provider=new RealAppyPayProvider(config);
    const event=provider.parseWebhook({id:'charge-1',merchantTransactionId:'ABC123',amount:100,responseStatus:{successful:true,status:'Success',code:100,message:'OK',source:'GPO'}});
    expect(event).toMatchObject({id:'charge-1:Success:100',paymentId:'charge-1',status:'PAID'});
  });
  it('does not include credentials in HTTP errors',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('denied',{status:401})));
    await expect(new RealAppyPayProvider(config).createPayment(input)).rejects.toThrow('APPYPAY_AUTH_HTTP_401');
  });
});
