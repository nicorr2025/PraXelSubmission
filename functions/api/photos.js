// GET /api/photos — list all photos grouped by batch
// GET /api/photos?key=batch-123/photo.jpg — serve a specific photo from R2

async function validateToken(request, env) {
  // Accept token via Authorization header or query param (for <img> tags)
  const url = new URL(request.url);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "") || url.searchParams.get("token") || "";
  if (!token || !env.GALLERY_PASSWORD) return false;

  const encoder = new TextEncoder();
  const data = encoder.encode(env.GALLERY_PASSWORD + "-praxel-secret");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expected = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return token === expected;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const bucket = env.PHOTOS_BUCKET;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // Require authentication for all photo access
  const valid = await validateToken(request, env);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  // If a key is provided, serve that specific photo
  if (key) {
    return servePhoto(bucket, key);
  }

  // Otherwise, list all photos grouped by batch
  return listPhotos(bucket);
}

async function servePhoto(bucket, key) {
  const object = await bucket.get(key);
  if (!object) {
    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(object.body, { status: 200, headers });
}

async function listPhotos(bucket) {
  const listed = await bucket.list({ limit: 1000 });
  const batches = {};

  for (const obj of listed.objects) {
    const parts = obj.key.split("/");
    // Support both old format (batchId/photo) and new format (folder/batchId/photo)
    if (parts.length < 2) continue;

    let folder, batchId;
    if (parts.length >= 3) {
      // New format: folder/batchId/photo.ext
      folder = parts[0];
      batchId = parts[1];
    } else {
      // Old format: batchId/photo.ext
      folder = "Uncategorized";
      batchId = parts[0];
    }

    const batchKey = `${folder}/${batchId}`;

    // Get custom metadata for this object
    const head = await bucket.head(obj.key);
    const meta = head?.customMetadata || {};

    if (!batches[batchKey]) {
      batches[batchKey] = {
        batchId,
        folder,
        submitter: meta.submitter || "Unknown",
        location: meta.location || folder.replace(/-/g, " "),
        uploadedAt: meta.uploadedAt || obj.uploaded?.toISOString() || "",
        photos: [],
      };
    }

    batches[batchKey].photos.push({
      key: obj.key,
      name: meta.originalName || parts[parts.length - 1],
      size: obj.size,
      type: head?.httpMetadata?.contentType || "image/jpeg",
      url: `/api/photos?key=${encodeURIComponent(obj.key)}`,
    });
  }

  // Sort batches by most recent first
  const sorted = Object.values(batches).sort(
    (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
  );

  return new Response(JSON.stringify({ batches: sorted }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
