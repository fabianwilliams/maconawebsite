// /api/subscribe — handles shipment-engagement form submissions.
// Receives form POST from macona.org/shipments/<slug>, calls Brevo DOI API
// to create a pending contact + send confirmation email. Brevo handles
// confirmation flow and adds the contact to list 37 (Shipment Engagement)
// with the QUESTION_FREE_TEXT and SOURCE_SHIPMENT_SLUG attributes on confirm.

const BREVO_LIST_ID = 37;
const BREVO_DOI_TEMPLATE_ID = 10; // "Macona DoubleOptIn" template
const BREVO_API_BASE = "https://api.brevo.com/v3";
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

module.exports = async function (context, req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: CORS_HEADERS, body: "" };
    return;
  }

  if (req.method !== "POST") {
    context.res = jsonResponse(405, { error: "Method not allowed" });
    return;
  }

  const body = req.body || {};
  const email = (body.email || "").trim().toLowerCase();
  const firstName = (body.firstName || "").trim().slice(0, 80);
  const question = (body.question || "").trim().slice(0, 2000);
  const shipmentSlug = (body.shipmentSlug || "").trim().slice(0, 200);
  const honeypot = body.website; // hidden anti-bot field; humans don't fill it

  if (honeypot) {
    // Bot caught. Pretend success to not signal detection.
    context.log("subscribe.honeypot.triggered", { shipmentSlug });
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
    context.res = jsonResponse(500, { error: "Server misconfigured" });
    return;
  }

  // Redirect after confirmation: back to the originating shipment page
  // with a confirmed=1 flag so the page can show a thank-you state.
  const redirectionUrl =
    shipmentSlug.length > 0
      ? `${ALLOWED_ORIGIN}/shipments/${encodeURIComponent(shipmentSlug)}/?confirmed=1`
      : `${ALLOWED_ORIGIN}/shipments/?confirmed=1`;

  const attributes = {
    FIRSTNAME: firstName,
  };
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
    const brevoResp = await fetch(`${BREVO_API_BASE}/contacts/doubleOptinConfirmation`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (brevoResp.status === 204 || brevoResp.status === 201 || brevoResp.status === 200) {
      context.log("subscribe.ok", { email, shipmentSlug });
      context.res = jsonResponse(200, { ok: true, status: "confirmation_email_sent" });
      return;
    }

    const errText = await brevoResp.text();
    context.log.error("subscribe.brevo_error", { status: brevoResp.status, body: errText.slice(0, 500) });

    // Treat 400 / "already in list" as success-pending to keep UX simple.
    if (brevoResp.status === 400 && /already.*subscribed|already.*opted|duplicate/i.test(errText)) {
      context.res = jsonResponse(200, { ok: true, status: "already_subscribed_or_pending" });
      return;
    }
    context.res = jsonResponse(502, { error: "Subscription service temporarily unavailable" });
  } catch (e) {
    context.log.error("subscribe.fetch_error", { message: e.message });
    context.res = jsonResponse(500, { error: "Server error" });
  }
};
