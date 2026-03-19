export async function onRequestPost(context) {
  const { request, env } = context;
  const password = env.GALLERY_PASSWORD;

  if (!password) {
    return new Response(JSON.stringify({ error: "Gallery password not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  try {
    const body = await request.json();
    const submitted = body.password || "";

    if (submitted === password) {
      // Create a simple token: base64 of password hash + timestamp
      const encoder = new TextEncoder();
      const data = encoder.encode(password + "-praxel-secret");
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const token = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      return new Response(JSON.stringify({ success: true, token }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Incorrect password" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Auth failed", detail: err.message }), {
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
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
