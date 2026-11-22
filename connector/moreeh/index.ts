// Moreeh connector — Supabase Edge Function "moreeh".
// Deploy it in the app's Supabase project with "Verify JWT" turned OFF (it checks the sign-in itself),
// then add the project in Moreeh → Projects. Needs connector/setup.sql to have been run first.
// No secrets to set: Supabase gives every function its own URL and keys.

const APP_NAME = "My app";               // shown in Moreeh's project switcher
const URL_ = Deno.env.get("SUPABASE_URL")!;
function firstKey(jsonName: string, legacyName: string): string {
  try { const all = JSON.parse(Deno.env.get(jsonName) || "{}"); if (all.default) return all.default; const v = Object.values(all); if (v.length) return String(v[0]); } catch (_) { /* legacy */ }
  return Deno.env.get(legacyName) || "";
}
const PUBLISHABLE = firstKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRET = firstKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...CORS } });
function headers(): Record<string, string> { const h: Record<string, string> = { apikey: SECRET, "Content-Type": "application/json" }; if (!SECRET.startsWith("sb_")) h.Authorization = `Bearer ${SECRET}`; return h; }
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...headers(), Prefer: "return=representation" } });
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}: ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: Record<string, unknown>) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
const n = (x: unknown) => Number(x || 0).toLocaleString("en-US");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: auth, apikey: PUBLISHABLE } });
  if (!u.ok) return json({ error: "unauthorized" }, 401);
  const user = await u.json();
  const admin = (await rest(`admins?select=role&user_id=eq.${user.id}`).catch(() => []))[0];
  if (!admin) return json({ error: "not_admin" }, 403);
  let body: Record<string, any> = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  try {
    switch (body.action) {
      case "me": return json({ role: admin.role, email: user.email, app: APP_NAME, features: ["overview", "audit"], connector: 2 });
      case "overview": {
        const o = await rpc("moreeh_overview", { p_days: 7 });
        return json({
          kpis: [
            { key: "users", label: "Users", value: n(o.users), sub: `+${n(o.new_users)} new this week`, detail: "users" },
            { key: "new", label: "New users", value: n(o.new_users), sub: "this week", detail: "new_users" },
            { key: "active", label: "Signed in", value: n(o.active_users), sub: "this week", detail: "active_users" }
          ],
          chart: { title: "Sign-ups per day", note: "last 14 days", points: o.per_day }, alerts: []
        });
      }
      case "detail": {
        if (!["users", "new_users", "active_users"].includes(body.kind)) return json({ error: "bad_kind" }, 400);
        return json(await rpc("moreeh_detail", { p_kind: body.kind, p_days: 7 }));
      }
      case "audit": return json({ audit: await rest("admin_audit?select=*&order=created_at.desc&limit=100") });
      default: return json({ error: "bad_action" }, 400);
    }
  } catch (e) { console.error("moreeh", e); return json({ error: "server_error" }, 500); }
});
