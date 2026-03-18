// GET /api/photos — list all photos grouped by batch
// GET /api/photos?key=batch-123/photo.jpg — serve a specific photo from R2

export async function onRequestGet(context) {
  const { request, env } = context;
  const bucket = env.PHOTOS_BUCKET;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
      status: 500,
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
    if (parts.length < 2) continue;

    const batchId = parts[0];

    // Get custom metadata for this object
    const head = await bucket.head(obj.key);
    const meta = head?.customMetadata || {};

    if (!batches[batchId]) {
      batches[batchId] = {
        batchId,
        submitter: meta.submitter || "Unknown",
        location: meta.location || "",
        uploadedAt: meta.uploadedAt || obj.uploaded?.toISOString() || "",
        photos: [],
      };
    }

    batches[batchId].photos.push({
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
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
