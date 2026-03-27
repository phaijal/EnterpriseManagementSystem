import { NextRequest } from "next/server";

const ERP_BASE_URL = process.env.ERP_BASE_URL || "http://localhost:8080";

function getCookieValue(cookieHeader: string, key: string) {
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${key}=`));
  if (!match) return "";
  return decodeURIComponent(match.slice(key.length + 1));
}

async function fetchCsrfFromDesk(cookieHeader: string) {
  try {
    const deskResponse = await fetch(`${ERP_BASE_URL}/`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
        Accept: "text/html",
        Origin: ERP_BASE_URL,
        Referer: `${ERP_BASE_URL}/`
      },
      cache: "no-store"
    });

    const html = await deskResponse.text();
    const match = html.match(/csrf_token["']?\s*[:=]\s*["']([^"']+)["']/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

type ProxyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function proxyRequest(request: NextRequest, method: ProxyMethod) {
  const rawPath = request.nextUrl.pathname.replace("/api/erpnext", "");
  const query = request.nextUrl.search ?? "";
  const targetUrl = `${ERP_BASE_URL}${rawPath}${query}`;

  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Origin", ERP_BASE_URL);
  headers.set("Referer", `${ERP_BASE_URL}/`);

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("Cookie", cookie);

    // ERPNext expects this header for unsafe requests (POST/PUT/DELETE).
    if (method !== "GET") {
      const csrfFromCookie = getCookieValue(cookie, "csrf_token");
      const csrfFromDesk = csrfFromCookie || (await fetchCsrfFromDesk(cookie));
      if (csrfFromDesk) headers.set("X-Frappe-CSRF-Token", csrfFromDesk);
    }
  }

  const csrfToken = request.headers.get("x-frappe-csrf-token");
  if (csrfToken) {
    headers.set("X-Frappe-CSRF-Token", csrfToken);
  }

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body: method === "GET" ? undefined : await request.text(),
    cache: "no-store"
  });

  const responseText = await upstream.text();
  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    upstream.headers.get("content-type") ?? "application/json"
  );

  const upstreamSetCookie = upstream.headers.get("set-cookie");
  if (upstreamSetCookie) {
    responseHeaders.set("set-cookie", upstreamSetCookie);
  }

  return new Response(responseText, {
    status: upstream.status,
    headers: responseHeaders
  });
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, "PUT");
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, "PATCH");
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, "DELETE");
}
