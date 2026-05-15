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

// POST /api/rank — set contest rank on a photo
// Body: { key: "folder/batch/photo.jpg", rank: 1-5 or "" to clear }
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
    const { key } = body;
    let { rank } = body;

    // Normalize rank
    if (rank === null || rank === undefined) rank = "";
    rank = String(rank);

    const validRanks = ["1", "2", "3", "4", "5", ""];
    if (!key || !validRanks.includes(rank)) {
      return new Response(JSON.stringify({ error: "Invalid key or rank (must be 1-5 or empty)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Get existing object
    const existing = await bucket.get(key);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Photo not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const meta = existing.customMetadata || {};

    // Only approved photos can be ranked
    if (rank && meta.reviewStatus !== "approved") {
      return new Response(JSON.stringify({ error: "Only approved photos can be ranked" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // If assigning a rank, clear it from any other photo that holds it
    let clearedKey = null;
    if (rank) {
      const listed = await bucket.list({ limit: 1000 });
      for (const obj of listed.objects) {
        if (obj.key === key || obj.key.startsWith("__")) continue;
        const head = await bucket.head(obj.key);
        const objMeta = head?.customMetadata || {};
        if (objMeta.contestRank === rank) {
          // Clear this photo's rank
          const oldObj = await bucket.get(obj.key);
          if (oldObj) {
            const oldMeta = oldObj.customMetadata || {};
            oldMeta.contestRank = "";
            await bucket.put(obj.key, oldObj.body, {
              httpMetadata: oldObj.httpMetadata,
              customMetadata: oldMeta,
            });
            clearedKey = obj.key;
          }
          break; // Only one photo can hold a rank
        }
      }
    }

    // Update the target photo's rank
    meta.contestRank = rank;
    await bucket.put(key, existing.body, {
      httpMetadata: existing.httpMetadata,
      customMetadata: meta,
    });

    return new Response(JSON.stringify({ success: true, key, rank, clearedKey }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Ranking failed", detail: err.message }), {
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
