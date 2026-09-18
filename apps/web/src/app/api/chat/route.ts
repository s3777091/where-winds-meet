export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const upstream = process.env.KNOWLEDGE_API_URL ?? "http://127.0.0.1:3210";

  try {
    const response = await fetch(`${upstream}/api/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: await request.text(),
      cache: "no-store",
    });

    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Kho tri thức đang khởi động. Hãy thử lại sau ít phút." }, { status: 503 });
  }
}
