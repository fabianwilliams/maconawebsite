// /api/subscribe — shipment-engagement form handler (v2: no fetch, uses https module for Node-version safety)
const https = require("https");

const BREVO_LIST_ID = 37;
const BREVO_DOI_TEMPLATE_ID = 10;
const BREVO_API_HOST = "api.brevo.com";
const BREVO_API_PATH = "/v3/contacts/doubleOptinConfirmation";
const ALLOWED_ORIGIN = "https://macona.org";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "3600",
};

function jsonResponse(status, body) {
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

function brevoPost(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: BREVO_API_HOST,
        path: BREVO_API_PATH,
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function (context, req) {
  context.log("subscribe.invoked", { method: req.method, nodeVersion: process.version });

  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: CORS_HEADERS, body: "" };
    return;
  }
  if (req.method !== "POST") {
    context.res = jsonResponse(405, { error: "Method not allowed" });
    return;
  }

  // req.body may be string or object depending on runtime; normalize.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      context.res = jsonResponse(400, { error: "Invalid JSON body" });
      return;
    }
  }
  body = body || {};

  const email = (body.email || "").trim().toLowerCase();
  const firstName = (body.firstName || "").trim().slice(0, 80);
  const question = (body.question || "").trim().slice(0, 2000);
  const shipmentSlug = (body.shipmentSlug || "").trim().slice(0, 200);
  const honeypot = body.website;

  if (honeypot) {
    context.log("subscribe.honeypot.triggered");
    context.res = jsonResponse(200, { ok: true, status: "pending" });
    return;
  }
  if (!isValidEmail(email)) {
    context.res = jsonResponse(400, { error: "Invalid email address" });
    return;
  }
  if (firstName.length === 0) {
    context.res = jsonResponse(400, { error: "First name is required" });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    context.log.error("subscribe.missing_api_key");
    context.res = jsonResponse(500, { error: "Server misconfigured (no api key)" });
    return;
  }

  const redirectionUrl =
    shipmentSlug.length > 0
      ? `${ALLOWED_ORIGIN}/shipments/${encodeURIComponent(shipmentSlug)}/?confirmed=1`
      : `${ALLOWED_ORIGIN}/shipments/?confirmed=1`;

  const attributes = { FIRSTNAME: firstName };
  if (question.length > 0) attributes.QUESTION_FREE_TEXT = question;
  if (shipmentSlug.length > 0) attributes.SOURCE_SHIPMENT_SLUG = shipmentSlug;

  const payload = {
    email,
    includeListIds: [BREVO_LIST_ID],
    templateId: BREVO_DOI_TEMPLATE_ID,
    redirectionUrl,
    attributes,
  };

  try {
    const resp = await brevoPost(apiKey, payload);
    if (resp.status >= 200 && resp.status < 300) {
      context.log("subscribe.ok", { email, shipmentSlug });
      context.res = jsonResponse(200, { ok: true, status: "confirmation_email_sent" });
      return;
    }
    context.log.error("subscribe.brevo_error", { status: resp.status, body: resp.body.slice(0, 500) });
    if (resp.status === 400 && /already.*subscribed|already.*opted|duplicate/i.test(resp.body)) {
      context.res = jsonResponse(200, { ok: true, status: "already_subscribed_or_pending" });
      return;
    }
    context.res = jsonResponse(502, { error: "Subscription service temporarily unavailable" });
  } catch (e) {
    context.log.error("subscribe.exception", { message: e.message, stack: (e.stack || "").slice(0, 300) });
    context.res = jsonResponse(500, { error: "Server error" });
  }
};
