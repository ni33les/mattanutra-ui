import { flushConnectMeta } from "@/lib/connect-verification";
import { getSql } from "@/lib/db";
try { await flushConnectMeta(); console.log("Connection event reconciliation completed (up to 25 attempts)."); }
finally { await getSql()?.end(); }
