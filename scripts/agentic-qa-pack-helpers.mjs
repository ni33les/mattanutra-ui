export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function lineImage(line) {
  if (!line || typeof line !== "object") {
    return "";
  }

  for (const key of ["imageUrl", "image_url", "image"]) {
    const value = line[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function optionLines(plan, frozenItems) {
  const lines = [];

  for (const item of plan?.basket ?? []) {
    lines.push(item);
  }

  for (const option of plan?.alternatives ?? []) {
    for (const item of option?.basket ?? []) {
      lines.push(item);
    }
  }

  for (const item of frozenItems ?? []) {
    lines.push(item);
  }

  return lines;
}

export function everyLineHasHttpImage(lines) {
  return lines.length > 0 && lines.every((line) => isHttpUrl(lineImage(line)));
}

export function isFixtureShapedId(productId) {
  const raw = String(productId ?? "");
  if (/^prd_b{8}/i.test(raw)) {
    return true;
  }

  const stripped = raw.replace(/^prd_/i, "").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  return /^b{8}-b{4}-b{4}-b{4}-b{12}$/i.test(stripped) ||
    /^b{8}-b{4}-b{4}-b{4}-b{12}$/i.test(raw);
}

export function isFixtureLine(line) {
  return line?.fixture === true || line?.source === "fixture";
}

export function exactToolNames(names) {
  return names.join(",") === "info,plan,execute,order,support,feedback";
}

export function planProfileHasSex(planTool) {
  const schema = planTool?.inputSchema ?? {};
  const profile =
    schema?.$defs?.PlanRequest?.properties?.profile ??
    schema?.properties?.request?.properties?.profile ??
    {};
  const properties = profile.properties ?? {};
  return Boolean(properties.sex);
}

export function unpaidA9EnvGate(env) {
  if (env === "dev") {
    return {
      pass: true,
      detail: "DEV env-gated: mocked pay never hits /order/track"
    };
  }

  if (env === "uat") {
    return {
      pass: true,
      detail:
        "UAT env-gated: unpaid execute never hits /order/track (POST pay forbidden; post-pay copy is not black-box)"
    };
  }

  return {
    pass: false,
    detail: "pay-confirm/track not host-visible after execute"
  };
}

export function hasOrderTrackDestination(...values) {
  return values.some((value) => /\/order\/track/i.test(String(value ?? "")));
}

export function collectTrackPointer(order, execute, html) {
  const retail = order?.retailCustomerOrder?.trackingUrl;
  if (typeof retail === "string" && retail.includes("/order/track")) {
    return retail;
  }

  const tracking = order?.fulfilment?.tracking?.[0]?.url;
  if (typeof tracking === "string" && tracking.includes("/order/track")) {
    return tracking;
  }

  for (const action of [
    execute?.successUrl,
    execute?.returnUrl,
    execute?.nextAction,
    order?.nextAction,
    order?.successUrl
  ]) {
    if (typeof action === "string" && action.includes("/order/track")) {
      return action.includes("/order/track/") ? action : null;
    }
  }

  const match = String(html ?? "").match(/\/(?:en|th|zh-CN)\/order\/track\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

export function withFromMcp(url) {
  if (!url) {
    return url;
  }

  if (/[?&]from=/.test(url)) {
    return url;
  }

  return url.includes("?") ? `${url}&from=mcp` : `${url}?from=mcp`;
}

export function absolutize(origin, url) {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${origin.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}
