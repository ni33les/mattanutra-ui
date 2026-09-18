import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, it } from "node:test";
import QRCode from "qrcode";
import { POST as connectRoute } from "../../app/api/assessment/[planId]/line-connect/route.ts";
import { POST as webhook } from "../../app/api/line/webhook/route.ts";
import { getSql, closeSqlPool } from "../../lib/db.ts";
import { createPharmacyOrder } from "../../lib/pharmacy-orders.ts";
import { dispatchCommunicationMessage } from "../../lib/communications.ts";
import { seedPharmacyFixture } from "../helpers/pharmacy-fixture.ts";
import { fixtureDatabaseUrl } from "../helpers/fixture-teardown.ts";
fixtureDatabaseUrl();
const sql=getSql()!;
after(closeSqlPool);
process.env.LINE_CHANNEL_SECRET="isolated-line-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN="isolated-line-token";
process.env.NEXT_PUBLIC_SITE_URL="https://pharmacy.example.test";
const user="U0123456789abcdef0123456789abcdef";
async function prepare(fixture:Awaited<ReturnType<typeof seedPharmacyFixture>>, locale=fixture.locale, order?:string) {
  return connectRoute(new Request(`http://localhost/api/assessment/${fixture.planId}/line-connect`,{method:"POST",headers:{"Content-Type":"application/json","x-forwarded-for":randomUUID()},body:JSON.stringify({source:"pharmacy_plan",pharmacy:fixture.slug,locale,retailCustomerOrderId:order})}),{params:Promise.resolve({planId:fixture.planId})});
}
async function receive(command:string, recipient=user, type="user", eventId=randomUUID()) {
  const body=JSON.stringify({events:[{type:"message",webhookEventId:eventId,replyToken:"isolated-reply",source:{type,userId:recipient,groupId:recipient},message:{type:"text",text:command}}]});
  const signature=createHmac("sha256",process.env.LINE_CHANNEL_SECRET!).update(body).digest("base64");
  return webhook(new Request("http://localhost/api/line/webhook",{method:"POST",headers:{"x-line-signature":signature},body}));
}
for(const locale of ["en","th","zh-CN"] as const) it(`PHARM-LINE ${locale} precomputes a private QR and durably delivers a localized hello and saved plan`,async()=>{
  const f=await seedPharmacyFixture(locale,false);
  const response=await prepare(f);assert.equal(response.status,200);
  const code=await response.json();
  assert.match(code.qrDataUrl??"",/^data:image\/png;base64,/,"The QR is ready before the user clicks and uses no external QR service");
  assert.equal(code.qrDataUrl,await QRCode.toDataURL(code.lineUrl,{width:256,margin:4,errorCorrectionLevel:"M"}));
  const url=new URL(code.lineUrl);assert.match(url.pathname,/\/R\/oaMessage\//);
  assert.equal(decodeURIComponent(url.search.slice(1)),code.command);assert.match(code.command,/^MN PLAN [A-Z0-9]{6,16}$/);
  assert.ok(!code.lineUrl.includes(f.planId),"QR exposes only a short-lived connection code");
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("Connecting and queueing must not call AI or providers");};
  try{assert.equal((await receive(code.command)).status,200);}finally{globalThis.fetch=savedFetch;}
  const rows=await sql`select id::text,body,status,channel_id::text from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`;
  assert.equal(rows.length,1);assert.equal(rows[0].status,"queued");assert.match(rows[0].body,new RegExp(locale==="en"?"Hello":locale==="th"?"สวัสดี":"你好"));
  assert.ok(rows[0].body.includes(`https://pharmacy.example.test/${locale}/retail/${f.slug}/plan?plan=${f.planId}`));
  assert.equal((await sql`select count(*)::int as n from public.tasks where task_type='dispatch_chat_communication_message' and payload->>'messageId'=${rows[0].id}`)[0].n,1);
  const sent:RequestInit[]=[];globalThis.fetch=async(input,init)=>{assert.equal(String(input),"https://api.line.me/v2/bot/message/push");sent.push(init!);return new Response("{}",{status:200,headers:{"x-line-request-id":"provider-ack"}});};
  try{const result=await dispatchCommunicationMessage(rows[0].id);assert.equal(result.message.status,"sent");}finally{globalThis.fetch=savedFetch;}
  assert.equal(sent.length,1);assert.equal(new Headers(sent[0].headers).get("X-Line-Retry-Key"),rows[0].id);assert.deepEqual(JSON.parse(String(sent[0].body)),{messages:[{text:rows[0].body,type:"text"}],to:user});
});
it("PHARM-LINE concurrent redelivery reuses one connection and message; groups and other users cannot claim it",async()=>{
  const f=await seedPharmacyFixture("en",false),code=await (await prepare(f)).json();
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>new Response("{}",{status:200});
  try{
    await receive(code.command,"C0123456789abcdef0123456789abcdef","group");
    assert.equal((await sql`select status from public.customer_line_connect_tokens where plan_id=${f.planId}::uuid`)[0].status,"active");
    const id=randomUUID();await Promise.all([receive(code.command,user,"user",id),receive(code.command,user,"user",id)]);
    const messages=await sql`select * from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`;
    assert.equal(messages.length,1);
    await receive(code.command,"U11111111111111111111111111111111");
    assert.deepEqual(await sql`select * from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`,messages);
    assert.equal((await sql`select count(*)::int as n from public.tasks where task_type='dispatch_chat_communication_message' and payload->>'messageId'=${messages[0].id}`)[0].n,1);
  }finally{globalThis.fetch=savedFetch;}
});
it("PHARM-LINE validates pharmacy/order ownership and pins the received link to the frozen order and display language",async()=>{
  const f=await seedPharmacyFixture(),other=await seedPharmacyFixture("en",false);
  const order=await createPharmacyOrder({planId:f.planId,pharmacy:f.slug,locale:"en",expectedRevision:f.revision,productIds:f.productIds,customerName:"QR Test"},randomUUID());
  assert.equal((await prepare(other,"en",order.id)).status,404);
  const code=await (await prepare(f,"th",order.id)).json();
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>new Response("{}",{status:200});try{await receive(code.command);}finally{globalThis.fetch=savedFetch;}
  const [row]=await sql`select body from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`;
  assert.ok(row?.body.includes(`/th/retail/${f.slug}/plan?plan=${f.planId}&order=${order.id}`));
});
it("PHARM-LINE expired codes do not connect and ordinary web connection responses stay compatible",async()=>{
  const f=await seedPharmacyFixture("en",false),code=await (await prepare(f)).json();
  await sql`update public.customer_line_connect_tokens set expires_at=now()-interval '1 minute' where plan_id=${f.planId}::uuid`;
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>new Response("{}",{status:200});try{await receive(code.command);}finally{globalThis.fetch=savedFetch;}
  assert.equal((await sql`select count(*)::int as n from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`)[0].n,0);
  const response=await connectRoute(new Request("http://localhost/api/assessment/line-connect",{method:"POST",body:JSON.stringify({source:"reveal_panya_support"})}),{params:Promise.resolve({planId:f.planId})});
  assert.equal(response.status,200);assert.match((await response.json()).command,/^MN [A-Z0-9]{6,16}$/);
});
it("PHARM-LINE accepted provider retries reuse the same key and acknowledge the existing delivery",async()=>{
  const f=await seedPharmacyFixture("en",false),code=await (await prepare(f)).json();
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>new Response("{}",{status:200});
  try{await receive(code.command);}finally{globalThis.fetch=savedFetch;}
  const [message]=await sql`select id::text from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`;
  assert.ok(message,"Delivery must be durable before contacting LINE");
  const keys:string[]=[];let attempt=0;
  globalThis.fetch=async(_url,init)=>{keys.push(new Headers(init?.headers).get("X-Line-Retry-Key")!);return ++attempt===1?new Response("temporary",{status:503}):new Response("already accepted",{status:409,headers:{"x-line-accepted-request-id":"original-ack"}});};
  try{assert.equal((await dispatchCommunicationMessage(message.id)).message.status,"failed");assert.equal((await dispatchCommunicationMessage(message.id)).message.status,"sent");}finally{globalThis.fetch=savedFetch;}
  assert.deepEqual(keys,[message.id,message.id]);
  assert.equal((await sql`select provider_message_id from public.communication_messages where id=${message.id}::uuid`)[0].provider_message_id,"original-ack");
});
it("PHARM-LINE failed delivery persistence rolls back connection consumption and can be retried",async()=>{
  const f=await seedPharmacyFixture("en",false),code=await (await prepare(f)).json();
  await sql.unsafe(`create or replace function public.pharmacy_line_fixture_failure() returns trigger language plpgsql as $$ begin if new.message_type='pharmacy_plan_welcome' then raise exception 'isolated delivery persistence failure'; end if; return new; end $$; create trigger pharmacy_line_fixture_failure before insert on public.communication_messages for each row execute function public.pharmacy_line_fixture_failure();`);
  const savedFetch=globalThis.fetch;globalThis.fetch=async()=>new Response("{}",{status:200});
  try{await assert.rejects(receive(code.command),/isolated delivery persistence failure/);assert.equal((await sql`select status from public.customer_line_connect_tokens where plan_id=${f.planId}::uuid`)[0].status,"active");}
  finally{globalThis.fetch=savedFetch;await sql.unsafe('drop trigger pharmacy_line_fixture_failure on public.communication_messages; drop function public.pharmacy_line_fixture_failure();');}
  assert.equal((await receive(code.command)).status,200);
  assert.equal((await sql`select count(*)::int as n from public.communication_messages where plan_id=${f.planId}::uuid and message_type='pharmacy_plan_welcome'`)[0].n,1);
});
