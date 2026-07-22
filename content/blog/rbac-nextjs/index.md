---
title: "RBAC in Next.js: Role-Based Access Control That Scales (2026)"
description: "How to implement role-based access control (RBAC) in Next.js: a central permission matrix, enforcing on the server (route handlers + server actions), gating UI, and the mistakes that create privilege-escalation holes — with real TypeScript code."
date: 2026-07-08
lastmod: 2026-07-20
slug: "rbac-nextjs"
---
<p>Every app starts with <code>if (user.role === "admin")</code> sprinkled through the code. It works — until you add a third role, a new action, or an edge case, and now the checks disagree with each other and a member can hit an endpoint they shouldn't. This guide shows a role-based access control (RBAC) setup for Next.js that stays correct as you grow: one permission matrix, enforced on the server.</p>

  <h2>Model permissions, not roles</h2>
  <p>The scaling trick is to check <em>permissions</em> (<code>project:delete</code>), not roles (<code>admin</code>), at the call site — and map roles → permissions in exactly one place. Add a role or shift a capability, and you edit one table instead of hunting through handlers:</p>
  <pre><code>// lib/rbac.ts
export type Role = "OWNER" | "ADMIN" | "MEMBER";

const PERMISSIONS: Record&lt;Role, string[]&gt; = {
  OWNER:  ["project:*", "member:*", "billing:*"],
  ADMIN:  ["project:*", "member:invite", "member:read"],
  MEMBER: ["project:read", "member:read"],
};

export class ForbiddenError extends Error {}

export function can(role: Role, action: string): boolean {
  return (PERMISSIONS[role] ?? []).some(
    p => p === action || (p.endsWith(":*") && action.startsWith(p.slice(0, -1))),
  );
}

export function assertCan(role: Role, action: string): void {
  if (!can(role, action)) throw new ForbiddenError(`${role} cannot ${action}`);
}</code></pre>

  <h2>Enforce on the server — always</h2>
  <p>Authorization lives on the server. A route handler or server action must re-check on every call; never rely on the UI having hidden a button.</p>
  <pre><code>// app/api/projects/[id]/route.ts
import { requireMembership } from "@/lib/tenant";  // resolves { role, organizationId }
import { assertCan, ForbiddenError } from "@/lib/rbac";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { role, organizationId } = await requireMembership();
    assertCan(role, "project:delete");
    await prisma.project.delete({ where: { id: params.id, organizationId } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response(e.message, { status: 403 });
    throw e;
  }
}</code></pre>
  <p>Server Actions are just as reachable as API routes — put the same <code>assertCan()</code> at the top of every one that mutates data.</p>

  <div class="warn">⚠️ Hiding a button in the UI is <strong>not</strong> authorization — it's convenience. Anyone can call the endpoint directly. The server check is the real gate; the UI check just avoids showing dead-ends.</div>

  <h2>Gate the UI with the same source of truth</h2>
  <p>Use the identical <code>can()</code> in the UI so what a user sees matches what the server allows:</p>
  <pre><code>const { role } = await requireMembership();
return (
  &lt;&gt;
    &lt;ProjectList /&gt;
    {can(role, "project:delete") && &lt;DeleteButton /&gt;}
  &lt;/&gt;
);</code></pre>

  <h2>Mistakes that create escalation holes</h2>
  <ul>
    <li><strong>UI-only checks</strong> — the classic. Always enforce server-side too.</li>
    <li><strong>Scattered role literals</strong> — <code>role === "admin"</code> everywhere drifts out of sync. Centralize in the matrix.</li>
    <li><strong>Forgetting Server Actions</strong> — they're public endpoints; authorize them like routes.</li>
    <li><strong>Role from the client</strong> — resolve the role from the session/membership server-side, never from a request field.</li>
    <li><strong>Mixing authz with tenancy</strong> — RBAC answers "can this role do X"; tenancy answers "within which org". You need both (see the multi-tenancy guide).</li>
  </ul>

  

  <h2>Takeaways</h2>
  <ol>
    <li>Check permissions, not roles, at the call site.</li>
    <li>Map roles → permissions in one matrix; edit one place to change access.</li>
    <li>Enforce on every route handler AND server action — server is the gate.</li>
    <li>Gate the UI with the same <code>can()</code> for UX, never as security.</li>
  </ol>

  <h2>FAQ</h2>
  <p><strong>Should I check roles or permissions in my code?</strong> Check permissions (like <code>project:delete</code>) at the call site, and map roles → permissions in one matrix. That way adding a role or shifting a capability is a one-line edit, not a hunt through handlers.</p>
  <p><strong>Is hiding a button enough to secure an action?</strong> No. UI gating is convenience, not security — anyone can call the endpoint directly. The real gate is the server-side <code>assertCan()</code> check on every route handler and Server Action.</p>
  <p><strong>Do Server Actions need the same authorization as API routes?</strong> Yes. Server Actions are public endpoints just like route handlers, so put the same permission check at the top of every one that mutates data.</p>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">About the author</strong><br>Published by <a href="https://slashmantools.us/about.html">slashman413</a> — maker of the free, privacy-first web tools at <a href="https://slashmantools.us/">intelligent agents (slashmantools.us)</a>, writing hands-on guides on AI, developer tooling and personal finance. <a href="https://slashmantools.us/about.html">More about us →</a></div>
