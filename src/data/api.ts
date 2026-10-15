// The browser's one way to call the server: JSON in, `{ ok, data } | { ok, error }` out. Errors carry the server's
// plain message (or a connection message), ready to show to the person.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Can't reach 1Fold — check your connection and try again", 0);
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !json?.ok) throw new ApiError(json?.error ?? "Something went wrong — please try again", res.status);
  return json.data as T;
}
