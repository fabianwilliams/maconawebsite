// Debug version — return EVERYTHING about the request so we can see what's happening
module.exports = async function (context, req) {
  try {
    const out = {
      ok: true,
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        hasFetch: typeof fetch !== "undefined",
      },
      request: {
        method: req.method,
        url: req.url,
        bodyType: typeof req.body,
        bodyIsString: typeof req.body === "string",
        bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : null,
        rawBody: typeof req.body === "string" ? req.body.slice(0, 200) : null,
      },
      env: {
        hasBrevoKey: !!process.env.BREVO_API_KEY,
        brevoKeyLen: (process.env.BREVO_API_KEY || "").length,
      },
    };
    context.res = {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://macona.org",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(out, null, 2),
    };
  } catch (e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "caught", message: e.message, stack: (e.stack || "").slice(0, 400) }),
    };
  }
};
