const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const requestURL = new URL(request.url);
  const upstream = process.env.CORE_API_URL ?? "http://127.0.0.1:3200";
  const target = new URL(`/api/v1/${path.join("/")}${requestURL.search}`, upstream);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: METHODS_WITHOUT_BODY.has(request.method) ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "cache-control", "content-length"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Dịch vụ bản đồ đang khởi động." }, { status: 503 });
  }
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
