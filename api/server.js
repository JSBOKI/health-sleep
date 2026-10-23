// Minimal ingest API for Apple Shortcuts -> Health & Sleep.
import http from "node:http";
import crypto from "node:crypto";
import { createClient } from "redis";

const PORT = Number(process.env.PORT || 10000);
const TOKEN = process.env.INGEST_TOKEN || "";
const KEY = "health:daily"; // Redis hash: date -> JSON
const mem = new Map();
let redis = null;
if (process.env.REDIS_URL) {
  redis = createClient({ url: process.env.REDIS_URL });
  redis.on("error", (e) => console.error("redis", e.message));
  await redis.connect();
}
const store = {
  get: async (d) => (redis ? redis.hGet(KEY, d) : mem.get(d)) ?? null,
  set: async (d, v) => (redis ? redis.hSet(KEY, d, v) : mem.set(d, v)),
  del: async (d) => (redis ? redis.hDel(KEY, d) : mem.delete(d)),
  all: async () => (redis ? redis.hGetAll(KEY) : Object.fromEntries(mem)),
};

const NUM = ["steps", "active_energy", "resting_hr", "avg_hr", "hrv", "sleep_hours", "weight", "vo2max"];
const SUM = new Set(["steps", "active_energy", "sleep_hours"]);

// Shortcuts may send "1,234", "62 bpm", "7.5\n0.3" (list), numbers, or arrays.
function parts(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(parts);
  if (typeof v === "number") return Number.isFinite(v) ? [v] : [];
  return String(v).split(/[\n\r;]+/).map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      const m = /[-+]?\d+(?:[.,]\d+)?/.exec(s.replace(/(\d),(?=\d{3}(?!\d))/g, "$1"));
      return m ? Number(m[0].replace(",", ".")) : NaN;
    })
    .filter(Number.isFinite);
}
function toNum(k, v) {
  const p = parts(v);
  if (!p.length) return undefined;
  const n = SUM.has(k) ? p.reduce((a, b) => a + b, 0) : p.reduce((a, b) => a + b, 0) / p.length;
  return Math.round(n * 100) / 100;
}
function toDate(v) {
  const s = String(v ?? "").trim();
  if (!s) return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // default: today JST
  if (/T\d|[+-]\d\d:?\d\d$|Z$/.test(s)) { // has explicit time zone -> convert to JST day
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const datePart = s.replace(/\s+(at\s+)?\d{1,2}:\d{2}.*$/i, "").replace(/\s+at\s*$/i, "");
  const t = Date.parse(datePart + " 00:00 UTC");
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}
function toText(v) {
  if (v == null || v === "") return undefined;
  const s = Array.isArray(v) ? v.join("\n") : String(v);
  return s.trim().split(/[\n\r]+/)[0].trim().slice(0, 64) || undefined;
}
function toWorkouts(v) {
  if (v == null || v === "") return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(/[\n\r]+/);
  const out = arr.map((w) => (typeof w === "object" && w ? w : String(w).trim())).filter((w) => w !== "");
  return out.length ? out.slice(0, 50) : undefined;
}
export function normalize(body) {
  const date = toDate(body.date);
  if (!date) return { error: "unparseable date" };
  const rec = { date };
  for (const k of NUM) { const n = toNum(k, body[k]); if (n !== undefined) rec[k] = n; }
  for (const k of ["sleep_start", "sleep_end"]) { const t = toText(body[k]); if (t) rec[k] = t; }
  const w = toWorkouts(body.workouts); if (w) rec.workouts = w;
  return { rec };
}

function authed(req) {
  const got = Buffer.from(String(req.headers["x-ingest-token"] || ""));
  const want = Buffer.from(TOKEN);
  return TOKEN && got.length === want.length && crypto.timingSafeEqual(got, want);
}
function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Ingest-Token",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  let s = "";
  for await (const c of req) { s += c; if (s.length > 1e6) throw new Error("too large"); }
  if (!s.trim()) return {};
  try { return JSON.parse(s); } catch { return Object.fromEntries(new URLSearchParams(s)); }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (url.pathname === "/api/health" || url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname === "/api/health/ingest" && req.method === "POST") {
      if (!authed(req)) return send(res, 401, { error: "unauthorized" });
      const body = await readBody(req);
      const { rec, error } = normalize(body);
      if (error) return send(res, 400, { error });
      const prev = JSON.parse((await store.get(rec.date)) || "{}");
      const merged = { ...prev, ...rec, updated_at: new Date().toISOString() };
      await store.set(rec.date, JSON.stringify(merged));
      return send(res, 200, { ok: true, record: merged });
    }
    if (url.pathname === "/api/health/data" && req.method === "DELETE") {
      if (!authed(req)) return send(res, 401, { error: "unauthorized" });
      const d = toDate(url.searchParams.get("date"));
      if (!url.searchParams.get("date") || !d) return send(res, 400, { error: "date required" });
      await store.del(d);
      return send(res, 200, { ok: true, deleted: d });
    }
    if (url.pathname === "/api/health/data" && req.method === "GET") {
      if (!authed(req)) return send(res, 401, { error: "unauthorized" });
      const all = await store.all();
      let days = Object.values(all).map((s) => JSON.parse(s)).sort((a, b) => a.date.localeCompare(b.date));
      const from = url.searchParams.get("from"), to = url.searchParams.get("to");
      if (from) days = days.filter((d) => d.date >= from);
      if (to) days = days.filter((d) => d.date <= to);
      return send(res, 200, { count: days.length, days });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "server error" });
  }
}).listen(PORT, () => console.log("listening", PORT, redis ? "redis" : "memory"));
