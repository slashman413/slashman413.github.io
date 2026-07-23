---
title: "Stripe Subscriptions in Next.js: The Complete Setup (App Router, 2026)"
description: "A practical guide to wiring Stripe subscriptions into a Next.js App Router app: the subscription Checkout Session, the webhook that syncs status to your DB, and the Billing Portal for self-serve cancels — with the three gotchas that break it in production."
date: 2026-07-10
lastmod: 2026-07-10
slug: "nextjs-stripe-subscriptions"
---
<p>Subscription billing in a Next.js SaaS is three moving parts, and the order matters: <strong>(1)</strong> start a subscription with a Checkout Session, <strong>(2)</strong> let Stripe tell your database the truth via a webhook, and <strong>(3)</strong> hand cancels/upgrades to Stripe's Billing Portal so you never build a billing UI. Get these three right and you can ignore almost everything else. This is the practical wiring for the App Router — the deep webhook-security details are in a <a href="https://slashmantools.us/blog/verify-stripe-webhook-nextjs/">companion post</a>.</p>

  <h2>1. Start the subscription — a Checkout Session</h2>
  <p>The only real difference from a one-time payment is <code>mode: 'subscription'</code> and a <em>recurring</em> price. A Route Handler creates the session server-side and returns its URL:</p>
  <pre><code>// app/api/checkout/route.ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const { userId, orgId } = await getSession()          // your auth
  const customerId = await ensureStripeCustomer(orgId)  // create once, store on the org

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.APP_URL}/billing?ok=1`,
    cancel_url: `${process.env.APP_URL}/billing`,
    // stamp your own ids so the webhook can map back to a tenant:
    subscription_data: { metadata: { orgId } },
  })
  return Response.json({ url: session.url })
}</code></pre>
  <p>Client redirects to <code>session.url</code>. <strong>Create the Stripe customer once</strong> and store <code>stripe_customer_id</code> on your org/user — you'll need it for the portal and to reconcile webhooks.</p>

  <div class="warn">⚠️ <b>Don't trust the <code>success_url</code> redirect as "they paid."</b> A user can hit it without completing payment, and network hiccups mean it may never fire. The <em>webhook</em> is the source of truth for subscription state — never grant access on the redirect alone.</div>

  <h2>2. Sync state — the webhook (the part that's actually load-bearing)</h2>
  <p>Stripe posts events; your job is to translate them into your DB. In an App Router route handler you must read the <strong>raw</strong> body — signature verification fails against parsed JSON:</p>
  <pre><code>// app/api/stripe/webhook/route.ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const body = await req.text()                       // RAW body, not req.json()
  const sig = req.headers.get('stripe-signature')!
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = await stripe.subscriptions.retrieve(
        (event.data.object as any).subscription ?? (event.data.object as any).id
      )
      await db.org.update({
        where: { stripeCustomerId: sub.customer as string },
        data: { plan: sub.status === 'active' ? 'pro' : 'free', subStatus: sub.status },
      })
      break
    }
  }
  return Response.json({ received: true })
}</code></pre>
  <p>Handle the three subscription lifecycle events (<code>completed</code>, <code>updated</code>, <code>deleted</code>) and write the status to the row keyed by <code>stripe_customer_id</code>. Make it <strong>idempotent</strong> — Stripe can deliver the same event more than once — and always return <code>2xx</code> quickly or Stripe retries. Full signature/replay hardening: <a href="https://slashmantools.us/blog/verify-stripe-webhook-nextjs/">Verify a Stripe webhook in Next.js</a>.</p>

  

  <h2>3. Cancels & upgrades — the Billing Portal (don't build this)</h2>
  <p>Do not build cancel/upgrade/payment-method UI. Stripe hosts it. One route redirects the user in:</p>
  <pre><code>// app/api/portal/route.ts
export async function POST() {
  const orgId = await getOrgId()
  const { stripeCustomerId } = await db.org.findUniqueOrThrow({ where: { id: orgId } })
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.APP_URL}/billing`,
  })
  return Response.json({ url: session.url })
}</code></pre>
  <p>Cancels, plan switches, card updates, invoice history — all handled by Stripe, and all flow back to you as the same webhook events from step 2. That's the payoff of making the webhook the source of truth: the portal "just works" without extra code.</p>

  <h2>The three gotchas that break this in production</h2>
  <ol>
    <li><strong>Parsed body in the webhook</strong> → signature verification fails. Use <code>await req.text()</code> and pass the raw string to <code>constructEvent</code>.</li>
    <li><strong>Granting access on the redirect</strong> instead of the webhook → users get access without paying, or lose it on a flaky redirect. Webhook is truth.</li>
    <li><strong>No idempotency</strong> → duplicate events double-apply. Key writes by <code>stripe_customer_id</code>/subscription id and make re-processing a no-op.</li>
  </ol>

  

  <h2>Recap</h2>
  <ol>
    <li>Checkout Session with <code>mode: 'subscription'</code> + a recurring price; store <code>stripe_customer_id</code>.</li>
    <li>Webhook on raw body → verify signature → sync <code>completed/updated/deleted</code> to your DB, idempotently.</li>
    <li>Billing Portal for all self-serve changes; they come back as the same webhook events.</li>
  </ol>

  <h2>FAQ</h2>
  <p><strong>How do I add subscriptions (not one-time payments) with Stripe Checkout?</strong> Create a Checkout Session with <code>mode: 'subscription'</code> and a recurring price ID in <code>line_items</code>, then redirect to <code>session.url</code>. The only real difference from a one-time payment is the subscription mode and a recurring price.</p>
  <p><strong>Why does my webhook signature verification fail?</strong> Because <code>constructEvent</code> needs the RAW request body, but frameworks often hand you parsed JSON. In an App Router route handler, read the raw text with <code>await req.text()</code> and pass that (not a parsed object) to <code>constructEvent</code>.</p>
  <p><strong>How do users cancel or change their subscription?</strong> Don't build a billing UI. Create a Stripe Billing Portal session and redirect them — Stripe hosts cancel, upgrade, payment-method, and invoice management, and every change flows back as the same webhook events.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
