// All "/api/..." calls are answered on this device by the local backend (core/local.js) — there is no server.
import { handle } from './core/local.js';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  try {
    const result = await handle(method, url, body);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return result as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const status = typeof (e as { status?: number }).status === 'number' ? (e as { status: number }).status : 500;
    throw new ApiError((e as Error).message || 'Something went wrong', status);
  }
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>('GET', url, undefined, signal),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};
