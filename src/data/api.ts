// The browser's one way to call the server: JSON in, `{ ok, data } | { ok, error }` out. Errors carry the server's
// plain message (or a connection message), ready to show to the person.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("Can't reach 1Fold — check your connection and try again", 0);
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !json?.ok) throw new ApiError(json?.error ?? "Something went wrong — please try again", res.status);
  return json.data as T;
}

export const api = <T>(path: string, body?: unknown): Promise<T> => call<T>(path, body === undefined ? { method: "GET" } : {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

/** Sends a file's bytes as the request body. */
export const upload = <T>(path: string, file: Blob): Promise<T> =>
  call<T>(path, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
