export async function onRequestPost(context) {
  const { request, env } = context;
  const bucket = env.PHOTOS_BUCKET;

  if (!bucket) {
    return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  try {
    const formData = await request.formData();
    const submitter = formData.get("submitter") || "Unknown";
    const location = formData.get("location") || "Uncategorized";
    // Sanitize location for use as a folder name (replace special chars with dashes)
    const folder = location.trim().replace(/[^a-zA-Z0-9\s\-#]/g, "").replace(/\s+/g, "-") || "Uncategorized";
    const batchId = `batch-${Date.now()}`;
    const uploaded = [];

    // Iterate all files in the form
    for (const [key, value] of formData.entries()) {
      if (value instanceof File && value.size > 0) {
        const ext = value.name.split(".").pop() || "jpg";
        const objectKey = `${folder}/${batchId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        await bucket.put(objectKey, value.stream(), {
          httpMetadata: { contentType: value.type },
          customMetadata: {
            originalName: value.name,
            submitter,
            location,
            batchId,
            uploadedAt: new Date().toISOString(),
          },
        });

        uploaded.push({
          key: objectKey,
          name: value.name,
          size: value.size,
          type: value.type,
        });
      }
    }

    if (uploaded.length === 0) {
      return new Response(
        JSON.stringify({ error: "No files were uploaded" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        batchId,
        submitter,
        location,
        files: uploaded,
        count: uploaded.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Upload failed", detail: err.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
