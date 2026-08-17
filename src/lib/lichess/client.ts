/* ── Client HTTP minimal pour l'API Lichess ──
   À utiliser exclusivement côté serveur (les tokens ne doivent jamais
   atteindre le navigateur). Gère :
   - Bearer token en-tête
   - erreurs 429 (rate limit) avec retry + backoff
   - erreurs 401 / 403 / 404 avec messages utiles
   - timeout réseau
*/

import { LichessApiError } from "./types";

export const LICHESS_BASE = "https://lichess.org";

export interface LichessRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown> | URLSearchParams;
  timeoutMs?: number;
  token?: string;
  maxRetries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function lichessRequest<T>(
  path: string,
  options: LichessRequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    timeoutMs = 15_000,
    token,
    maxRetries = 3,
  } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let bodyInit: BodyInit | undefined;
  if (body instanceof URLSearchParams) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    bodyInit = body;
  } else if (body && typeof body === "object") {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let lastError: LichessApiError | Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${LICHESS_BASE}${path}`, {
        method,
        headers,
        body: bodyInit,
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "1");
        lastError = new LichessApiError(`Lichess rate limit (429) — réessai dans ${retryAfter}s.`, 429);
        if (attempt < maxRetries - 1) {
          await sleep(retryAfter * 1000);
          continue;
        }
        throw lastError;
      }

      if (res.status === 401) {
        const bodyText = await res.text().catch(() => "");
        throw new LichessApiError("Lichess : token invalide ou expiré (401).", 401, bodyText);
      }

      if (res.status === 403) {
        throw new LichessApiError("Lichess : accès refusé (403) — scopes insuffisants.", 403);
      }

      if (res.status === 404) {
        throw new LichessApiError("Lichess : ressource introuvable (404).", 404);
      }

      if (res.status === 204) return undefined as T;

      if (res.status === 200) {
        const text = await res.text();
        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      }

      if (res.status >= 400) {
        const bodyText = await res.text().catch(() => "");
        throw new LichessApiError(
          `Lichess : erreur HTTP ${res.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}.`,
          res.status,
          bodyText,
        );
      }

      return undefined as T;
    } catch (err) {
      if (err instanceof LichessApiError && err.status === 429) {
        /* déjà géré */
      } else if (err instanceof Error && err.name === "AbortError") {
        throw new LichessApiError("Lichess : timeout réseau.", 408);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries - 1) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
      }
      throw lastError instanceof LichessApiError
        ? lastError
        : new LichessApiError("Lichess : erreur réseau.", 0, String(lastError?.message ?? ""));
    }
  }

  throw lastError ?? new LichessApiError("Lichess : erreur inconnue.", 0);
}

/** Vérifie que le token est valide (`GET /api/account`). */
export async function lichessAccount(token: string) {
  return lichessRequest<{ id: string; username: string }>("/api/account", { token });
}

/** Vérifie qu'un pseudo existe (`GET /api/user/{username}` — public). */
export async function lichessUserExists(username: string): Promise<boolean> {
  try {
    await lichessRequest(`/api/user/${encodeURIComponent(username)}`);
    return true;
  } catch (err) {
    if (err instanceof LichessApiError && err.status === 404) return false;
    throw err;
  }
}