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

// POST /api/review — set review status on a photo
// Body: { key: "folder/batch/photo.jpg", status: "approved" | "denied" | "" }
export async function onRequestPost(context) {
  const { request, env } = context;
  const bucket = env.PHOTOS_BUCKET;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const valid = await validateToken(request, env);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  try {
    const body = await request.json();
    const { key, status } = body;

    if (!key || !["approved", "denied", ""].includes(status)) {
      return new Response(JSON.stringify({ error: "Invalid key or status" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Get existing object to preserve its data and metadata
    const existing = await bucket.get(key);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Photo not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Re-upload with updated metadata (R2 doesn't support metadata-only updates)
    const meta = existing.customMetadata || {};
    meta.reviewStatus = status;

    await bucket.put(key, existing.body, {
      httpMetadata: existing.httpMetadata,
      customMetadata: meta,
    });

    return new Response(JSON.stringify({ success: true, key, status }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Review failed", detail: err.message }), {
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
