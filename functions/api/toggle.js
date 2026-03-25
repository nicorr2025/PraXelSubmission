// GET /api/toggle — check if contest submissions are open (public)
// POST /api/toggle — enable/disable contest submissions (requires auth)

const TOGGLE_KEY = "__contest_toggle";

async function validateToken(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token || !env.GALLERY_PASSWORD) return false;

  const encoder = new TextEncoder();
  const data = encoder.encode(env.GALLERY_PASSWORD + "-praxel-secret");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expected = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return token === expected;
}

export async function onRequestGet(context) {
  const { env } = context;
  const bucket = env.PHOTOS_BUCKET;

  try {
    const obj = await bucket.get(TOGGLE_KEY);
    if (obj) {
      const data = JSON.parse(await obj.text());
      return new Response(JSON.stringify({ enabled: data.enabled }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
  } catch (err) {
    // Default to enabled
  }

  return new Response(JSON.stringify({ enabled: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const bucket = env.PHOTOS_BUCKET;

  const valid = await validateToken(request, env);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  try {
    const body = await request.json();
    const enabled = body.enabled !== false;

    await bucket.put(TOGGLE_KEY, JSON.stringify({ enabled, updatedAt: new Date().toISOString() }), {
      httpMetadata: { contentType: "application/json" },
    });

    return new Response(JSON.stringify({ success: true, enabled }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to update toggle" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
