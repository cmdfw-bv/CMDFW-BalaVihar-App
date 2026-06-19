import type { Handler } from "@netlify/functions";

// Proves the trusted-server tier runs locally. Privileged secrets (service-role/VAPID/SES)
// will be read from process.env HERE — never in client code (§12.1#2).
export const handler: Handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({ status: "ok", tier: "netlify-functions" }),
});
