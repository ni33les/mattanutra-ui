import { publicLocales } from "@/lib/i18n";
import { type MetaEnvironment, type MetaPublicConfig, metaEventName } from "@/lib/meta-event-policy";

export type MetaBootstrapPageView = {
  eventId: string;
  sourceUrl: string;
  pixelId: string;
  environment: MetaEnvironment;
};

declare global {
  interface Window {
    __mnMetaPageView?: MetaBootstrapPageView;
  }
}

function inlineJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Executed by the HTML parser in <head>, before hydration or application APIs. */
export function metaPixelBootstrapScript(config: MetaPublicConfig, data: Record<string, string | number>) {
  const { enabled, environment, pixelId } = config;
  if (!enabled || !["dev", "uat", "prd"].includes(environment) || !/^\d{5,20}$/.test(pixelId)) return "";
  return `(function(){
var environment=${inlineJson(environment)},pixelId=${inlineJson(pixelId)};
var origin=location.origin,local=environment==='dev'&&/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname);
var expected=environment==='prd'?'https://mattanutra.com':'https://'+environment+'.mattanutra.com';
if(origin!==expected&&!(environment==='prd'&&origin==='https://www.mattanutra.com')&&!local)return;
if(${inlineJson(publicLocales)}.indexOf(location.pathname.split('/')[1])===-1||/\\/(admin|api)(\\/|$)/.test(location.pathname))return;
if(document.cookie.split(';').some(function(c){return c.trim()==='mn_marketing=denied';}))return;
if(window.__mnMetaPageView)return;
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;t.id='facebook-fbevents';t.referrerPolicy='no-referrer';s=b.getElementsByTagName(e)[0];
if(s)s.parentNode.insertBefore(t,s);else b.head.appendChild(t)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
var fbq=window.fbq;
fbq('set','autoConfig',false,pixelId);
fbq('init',pixelId);
var eventId=crypto.randomUUID();
window.__mnMetaPageView={eventId:eventId,sourceUrl:location.href,pixelId:pixelId,environment:environment};
fbq(${inlineJson(environment === "prd" ? "track" : "trackCustom")},${inlineJson(metaEventName("PageView", environment))},${inlineJson(data)},{eventID:eventId});
})();`;
}
