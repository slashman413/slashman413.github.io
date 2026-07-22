---
title: "Multi-Tenancy in Next.js: Scope Every Query the Safe Way (2026)"
description: "How to build multi-tenant SaaS in Next.js without leaking one customer's data to another: the organization-scoping pattern, a central tenant resolver, RBAC, and the mistakes to avoid — with real Prisma + Auth.js code."
date: 2026-07-08
lastmod: 2026-07-20
slug: "nextjs-multi-tenancy"
---
<p>Multi-tenancy is the part of B2B SaaS that quietly keeps founders up at night. Get it wrong and one customer sees another customer's data — the kind of bug that ends a company. This guide covers the pragmatic pattern for building multi-tenant apps in <strong>Next.js 16 + Prisma + Auth.js</strong>: shared database, row-level isolation, and a discipline that makes leaks structurally hard.</p>

  <h2>What "multi-tenant" actually means</h2>
  <p>A tenant is a customer <em>organization</em>. The common, cost-effective model is a <strong>single shared database</strong> where every business row carries an <code>organizationId</code>, and every query filters by it. (Separate DB-per-tenant exists but is operationally heavy; most SaaS starts shared.) The whole game is: <strong>no query ever runs without the tenant filter.</strong></p>

  <h2>The core rule: resolve tenant context centrally</h2>
  <p>The failure mode is treating isolation as a convention — "remember to add <code>where: { organizationId }</code>." Someone eventually forgets, and that's your data leak. Instead, resolve the caller's tenant context in one place, on every request:</p>
  <pre><code>// lib/tenant.ts
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export class UnauthorizedError extends Error {}

// Resolves who is calling and which org they're acting in — server-side,
// from the session. Never trust an organizationId from the client body.
export async function requireMembership(orgSlug?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError("Not signed in");

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      ...(orgSlug ? { organization: { slug: orgSlug } } : {}),
    },
    include: { organization: true },
  });
  if (!membership) throw new UnauthorizedError("No org access");

  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    role: membership.role, // OWNER | ADMIN | MEMBER
  };
}</code></pre>

  <p>Now every handler starts the same way, and the <code>organizationId</code> it filters by comes from the <em>session</em>, not from user input:</p>
  <pre><code>// app/api/projects/route.ts
export async function GET() {
  const { organizationId } = await requireMembership();
  const projects = await prisma.project.findMany({
    where: { organizationId },        // scoped — always
  });
  return Response.json({ data: projects });
}</code></pre>

  <div class="warn">⚠️ <strong>Never</strong> take <code>organizationId</code> from the request body or query string. If the client can name the org, they can name <em>someone else's</em> org. The tenant must be derived server-side from the authenticated session's membership.</div>

  <h2>Layer RBAC on top</h2>
  <p>Roles decide what a member can do <em>within</em> their org. Don't scatter <code>if (role === "admin")</code> everywhere — centralize it in a permission matrix:</p>
  <pre><code>// lib/rbac.ts
const PERMISSIONS = {
  OWNER:  ["project:*", "member:*", "billing:*"],
  ADMIN:  ["project:*", "member:invite"],
  MEMBER: ["project:read"],
} as const;

export class ForbiddenError extends Error {}

export function assertCan(role: string, action: string) {
  const granted = PERMISSIONS[role] ?? [];
  const ok = granted.some(p => p === action ||
    (p.endsWith(":*") && action.startsWith(p.slice(0, -1))));
  if (!ok) throw new ForbiddenError(`${role} cannot ${action}`);
}</code></pre>
  <p>Then a delete is two honest lines: <code>const { role } = await requireMembership(); assertCan(role, "project:delete");</code></p>

  <h2>The mistakes that cause leaks</h2>
  <ul>
    <li><strong>Trusting client-supplied org IDs</strong> — the #1 cause. Always derive from the session.</li>
    <li><strong>Un-scoped <code>findUnique</code> by id</strong> — fetching a row by its primary key alone skips the tenant filter. Scope it: <code>where: { id, organizationId }</code>.</li>
    <li><strong>Forgotten joins</strong> — nested reads/writes need the org filter too, not just the top-level query.</li>
    <li><strong>Background jobs</strong> — cron and webhooks have no session; pass and enforce the tenant explicitly.</li>
    <li><strong>No audit trail</strong> — when something does go wrong, you need to know who did what, per org.</li>
  </ul>

  <h2>Build it yourself, or start from a done version</h2>
  <p>You can absolutely build all of this — it's a good exercise and the pattern above is the core of it. But wiring auth, org/membership models, the tenant resolver, RBAC, billing hooks, API keys, and audit logs cleanly takes most people 40–80 hours before they write a single feature.</p>

  

  <h2>Takeaways</h2>
  <ol>
    <li>Shared DB + <code>organizationId</code> on every business row.</li>
    <li>Resolve <code>{ userId, organizationId, role }</code> centrally, from the session — never the client.</li>
    <li>Filter <em>every</em> query by <code>organizationId</code>, including id lookups and joins.</li>
    <li>Centralize permissions in one matrix; add a per-org audit log early.</li>
  </ol>

  <h2>FAQ</h2>
  <p><strong>Should <code>organizationId</code> come from the request or the session?</strong> Always from the authenticated session's membership, resolved server-side. If the client can name the org, they can name someone else's — that's the #1 cause of cross-tenant leaks.</p>
  <p><strong>Is a single shared database safe for multi-tenant SaaS?</strong> Yes, as long as every business row carries an <code>organizationId</code> and every query filters by it. A shared DB is the common, cost-effective model; the discipline — never a query without the tenant filter — is what keeps it safe.</p>
  <p><strong>Do I need both multi-tenancy and RBAC?</strong> Yes — they answer different questions. Tenancy scopes <em>which org's data</em> a request can touch; RBAC decides <em>what a member can do</em> within that org. You enforce both on every mutation.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">AI工具人 (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
