import { resolveCapability } from "@/lib/agentic/capabilities";
import { orderForRead } from "@/lib/agentic/presentation/order-read";
import { orderPollView } from "@/lib/agentic/commerce/state";
import { buildOrderProjection } from "@/lib/agentic/commerce/timeline";
import { contributionFromFrozen } from "@/lib/agentic/funnel/events";
import { responsibilitySnapshot } from "@/lib/agentic/responsibility/matrix";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { AgenticRuntime } from "@/lib/agentic/runtime";

/** Private fixture observations retain accounting and event-ledger evidence.
 * Public order has one concise response; this is not a transport response mode. */
export async function readOrderForQa(input: Pick<AgenticRuntime,"config"|"scope"|"store"> & {now:string;orderHandle:string}) {
  const capability=await resolveCapability({action:"order.read",config:input.config,handle:input.orderHandle,
    now:input.now,resourceType:"order",scope:input.scope,store:input.store});
  const saved=capability?await input.store.getOrder(capability.resourceId):null;
  const order=orderForRead(saved,input.now);
  const [fulfilment,paymentAttempts,items]=order?await Promise.all([
    input.store.listFulfilmentEvents(order.id),input.store.listPaymentAttempts(order.id),input.store.getOrderItems(order.id)
  ]):[[],[],[]];
  const view=orderPollView({checkoutUrl:order?.checkoutUrl??null,found:Boolean(order),
    fulfilmentEvents:fulfilment,localeMessage:key=>agenticMessage("en",key),order});
  if(!saved||!order||!view.ok)return view;
  const projection=buildOrderProjection({fulfilment,items,order:saved,paymentAttempts});
  const money=contributionFromFrozen({frozen:saved.frozenPlan,paid:saved.paymentStatus==="paid"});
  return {...view,events:projection.events,money:projection.money,timeline:projection.timeline,
    acquisitionMinor:money?.acquisitionMinor??0,attribution:money?.attribution??"unattributed",contributionMinor:money?.contributionMinor??null,
    paymentFeeMinor:money?.paymentFeeMinor??0,paymentMinor:money?.paymentMinor??saved.totalPriceMinor,
    productCostMinor:money?.productCostMinor??items.reduce((sum,item)=>sum+item.lineTotalMinor,0),
    shippingSubsidyMinor:money?.shippingSubsidyMinor??0,responsibility:responsibilitySnapshot("en")};
}
