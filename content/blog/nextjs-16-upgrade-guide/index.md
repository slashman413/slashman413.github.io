---
title: "Upgrading a Next.js SaaS from 15 to 16 (2026): What Actually Breaks"
description: "A practical Next.js 15 → 16 upgrade guide from a real SaaS migration: the async Request APIs breaking change, middleware.js → proxy.js, the Turbopack config move, the codemod, and the stale-generated-client gotcha that causes phantom TypeScript errors."
date: 2026-07-10
lastmod: 2026-07-20
slug: "nextjs-16-upgrade-guide"
---
<p>Next.js 16 is a smaller jump than 14→15, but it does remove things that version 15 only <em>deprecated</em>. This is a field guide from upgrading a real multi-tenant SaaS (Next.js 15.5 → 16.2): what the codemod handles for you, the one breaking change that touches actual application code, and a generated-code gotcha that sends people chasing TypeScript errors that were never Next.js's fault.</p>

  <h2>Step 0: run the codemod</h2>
  <p>Don't hand-edit what a tool can do. The official upgrade codemod bumps your dependencies and applies most mechanical migrations:</p>
  <pre><code>npx @next/codemod@canary upgrade latest</code></pre>
  <p>It will update <code>next</code>, <code>react</code>, and <code>react-dom</code>, and offer to run the individual transforms below. Commit first so the diff is reviewable.</p>

  <h2>Breaking change #1: Request APIs are now async-only</h2>
  <p>This is the one that matters. Next.js 15 let you call <code>cookies()</code>, <code>headers()</code>, <code>draftMode()</code>, and read <code>params</code> / <code>searchParams</code> synchronously (with a warning). <strong>Next.js 16 removes synchronous access entirely</strong> — these are now async and must be awaited (or unwrapped with <code>React.use()</code> in Client Components).</p>
  <pre><code>// Next.js 15 (worked, with a deprecation warning)
const token = cookies().get('token')

// Next.js 16 — await it
const token = (await cookies()).get('token')

// In a Server Component page, params/searchParams are Promises too:
export default async function Page({ params }) {
  const { slug } = await params
}</code></pre>
  <p>There's a codemod for this specifically — it rewrites most call sites for you:</p>
  <pre><code>npx @next/codemod@canary next-async-request-api .</code></pre>
  <div class="warn">⚠️ For multi-tenant SaaS this touches your hottest path: anywhere you resolve the session/tenant from <code>cookies()</code> or <code>headers()</code> now needs <code>await</code>. Grep for <code>cookies(</code> and <code>headers(</code> after the codemod and eyeball each one — the transform is good but a missed site fails at runtime, not build.</div>

  <h2>Breaking change #2: <code>middleware.js</code> → <code>proxy.js</code></h2>
  <p>The middleware file convention was renamed. If you have a root <code>middleware.ts</code> (auth gate, redirects), rename it — again, there's a codemod:</p>
  <pre><code>npx @next/codemod@canary middleware-to-proxy .</code></pre>

  <h2>Config change: Turbopack moved to the top level</h2>
  <p>Turbopack config graduated out of <code>experimental</code>. Move it in <code>next.config.ts</code>:</p>
  <pre><code>// before (15)            →  after (16)
// experimental: {           turbopack: {
//   turbopack: { ... }        ...
// }                        }</code></pre>

  <h2>The gotcha nobody warns you about: stale generated code</h2>
  <p>After the upgrade our type check lit up with errors that <em>looked</em> like Next.js or React type regressions. They weren't. They were a <strong>stale Prisma client</strong> — the generated types in <code>node_modules/.prisma</code> predated the dependency bump. The fix is boring and total:</p>
  <pre><code>npx prisma generate      # regenerate the DB client
# ...and any other codegen you run (GraphQL, tRPC, i18n, etc.)
npx tsc --noEmit         # now the phantom errors are gone</code></pre>
  <p>Rule of thumb after any major framework bump: <strong>regenerate before you debug.</strong> More than half of "the upgrade broke my types" reports are stale codegen, not the framework.</p>

  <h2>Verify, in order</h2>
  <ol>
    <li><code>npx tsc --noEmit</code> — types clean (after regenerating codegen).</li>
    <li><code>next build</code> — the real gate; confirm every route still compiles.</li>
    <li>Smoke-test the auth/tenant flow — because the async Request API change hits it hardest and can fail at runtime, not build.</li>
  </ol>

  

  <h2>Should you upgrade now?</h2>
  <p>Yes, if you're actively building — the async Request API change only gets more expensive to defer as your codebase grows, and buyers of dev tooling notice a stale major version. If you're mid-launch and frozen, do it right after. The codemod plus a regenerate-and-rebuild pass is usually an afternoon, not a week.</p>

  <h2>Recap</h2>
  <ol>
    <li>Run <code>@next/codemod upgrade latest</code>; commit first.</li>
    <li><code>await</code> all Request APIs (<code>cookies</code>/<code>headers</code>/<code>draftMode</code>/<code>params</code>/<code>searchParams</code>) — use the <code>next-async-request-api</code> codemod, then eyeball auth/tenant call sites.</li>
    <li>Rename <code>middleware</code> → <code>proxy</code>; move Turbopack config top-level.</li>
    <li>Regenerate Prisma/other codegen <em>before</em> debugging type errors.</li>
    <li><code>tsc --noEmit</code> → <code>next build</code> → smoke-test auth.</li>
  </ol>

  <h2>FAQ</h2>
  <p><strong>Is the Next.js 15 → 16 upgrade hard?</strong> For most apps it's moderate. The codemod (<code>npx @next/codemod@canary upgrade latest</code>) handles the mechanical parts; the one change that touches real code is that Request APIs — <code>cookies</code>, <code>headers</code>, <code>draftMode</code>, <code>params</code>, <code>searchParams</code> — are now async-only and must be awaited.</p>
  <p><strong>What is the biggest breaking change in Next.js 16?</strong> The full removal of synchronous access to dynamic Request APIs. You must now <code>await</code> them (or unwrap with <code>React.use()</code> in Client Components). The <code>next-async-request-api</code> codemod migrates most call sites automatically.</p>
  <p><strong>Why do I get TypeScript errors after upgrading?</strong> Often they aren't from Next.js at all but from stale generated code. Regenerate your Prisma client (<code>npx prisma generate</code>) and any other codegen, then re-run the type check — the phantom errors usually disappear once generated types match the new versions.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">AI工具人 (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
