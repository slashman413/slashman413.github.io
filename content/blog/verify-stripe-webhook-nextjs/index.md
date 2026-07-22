---
title: "Verify a Stripe Webhook in Next.js"
description: "How to verify Stripe webhook signatures in a Next.js App Router route handler: read the raw body, check the stripe-signature HMAC-SHA256, reject replays, and fail closed — with copy-paste code and the mistakes that let forged events through."
date: 2026-07-08
lastmod: 2026-07-20
slug: "verify-stripe-webhook-nextjs"
---
<p>A webhook endpoint that doesn't verify signatures will happily accept a <em>forged</em> "payment succeeded" event — and hand out paid access for free. Verifying the <code>stripe-signature</code> header is not optional. Here's how to do it correctly in a Next.js 16 App Router route handler, with the two gotchas (raw body + runtime) that trip most people up.</p>

  <h2>The two things Next.js gets in your way about</h2>
  <ul>
    <li><strong>Raw body</strong> — signature verification hashes the <em>exact bytes</em> Stripe sent. If anything parses the JSON first, the bytes change and verification fails. In the App Router, use <code>await req.text()</code> and never <code>req.json()</code> before verifying.</li>
    <li><strong>Node runtime</strong> — you need <code>node:crypto</code>. Add <code>export const runtime = "nodejs"</code> so it doesn't run on the Edge.</li>
  </ul>

  <h2>The verification, without the Stripe SDK</h2>
  <p>Stripe's <code>stripe-signature</code> header looks like <code>t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, where <code>v1</code> is <code>HMAC-SHA256(secret, "{t}.{payload}")</code>. You can verify it with just <code>node:crypto</code> — no dependency:</p>
  <pre><code>import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE = 60 * 5; // reject events older than 5 min (replay defense)

export function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts: Record&lt;string, string&gt; = {};
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts.t, sig = parts.v1;
  if (!t || !sig) return false;

  // Replay window
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE) return false;

  // HMAC over `${t}.${rawBody}`
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  // constant-time compare — and length-check first (timingSafeEqual throws on mismatch)
  return a.length === b.length && timingSafeEqual(a, b);
}</code></pre>

  <h2>The route handler — fail closed</h2>
  <pre><code>export const runtime = "nodejs";

export async function POST(req: Request) {
  const payload = await req.text();                    // RAW body, before any parse
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("not configured", { status: 500 });

  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("invalid signature", { status: 400 });  // reject forgeries
  }

  const event = JSON.parse(payload);                   // safe to parse AFTER verifying
  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // ... update your DB (idempotently — Stripe retries)
      break;
  }
  return Response.json({ received: true });
}</code></pre>

  <div class="warn">⚠️ <strong>Fail closed:</strong> if the secret is missing or the signature is invalid, reject — never "allow on error." And verify <em>before</em> you parse or act on anything in the body.</div>

  <h2>Mistakes that let forged events through</h2>
  <ul>
    <li><strong>Parsing the body first</strong> (<code>req.json()</code>) — breaks the byte-exact hash; people then "fix" it by skipping verification. Don't.</li>
    <li><strong>Plain string compare</strong> (<code>expected === sig</code>) — timing-leaky. Use <code>timingSafeEqual</code> with a length check.</li>
    <li><strong>No timestamp check</strong> — a captured valid request can be replayed later. Enforce a tolerance window.</li>
    <li><strong>Not idempotent</strong> — Stripe retries; process the same event twice and you double-apply. Dedupe on the event id.</li>
    <li><strong>Edge runtime</strong> — <code>node:crypto</code> isn't available; force <code>runtime = "nodejs"</code>.</li>
  </ul>

  

  <h2>Testing locally</h2>
  <p>Use the Stripe CLI: <code>stripe listen --forward-to localhost:3000/api/billing/webhook</code>. It prints a signing secret (<code>whsec_...</code>) — set that as <code>STRIPE_WEBHOOK_SECRET</code> in dev, then <code>stripe trigger customer.subscription.updated</code> to fire a real, correctly-signed test event.</p>

  <h2>FAQ</h2>
  <p><strong>Why must I use the raw request body?</strong> Signature verification hashes the exact bytes Stripe sent. If anything parses the JSON first, the bytes change and verification fails. In the App Router, use <code>await req.text()</code> and never <code>req.json()</code> before verifying.</p>
  <p><strong>Do I need the Stripe SDK to verify a webhook?</strong> No. The <code>stripe-signature</code> header is just <code>t=&lt;unix&gt;,v1=&lt;hex&gt;</code> where <code>v1</code> is <code>HMAC-SHA256(secret, "{t}.{payload}")</code>. You can verify it with only <code>node:crypto</code> — though the SDK's <code>constructEvent</code> does the same thing for you.</p>
  <p><strong>Why force the Node runtime?</strong> Because <code>node:crypto</code> isn't available on the Edge. Add <code>export const runtime = "nodejs"</code> so the handler doesn't run on the Edge and fail to verify.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
