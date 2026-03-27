import axios from "axios";
import { AxiosError } from "axios";
import { emitSessionInvalid } from "@/lib/sessionEvents";

export const api = axios.create({
  // Use a local proxy route to avoid browser CORS issues.
  baseURL: "/api/erpnext",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.response.use(
  (response) => {
    const d = response.data;
    if (
      d &&
      typeof d === "object" &&
      (d as { exc_type?: string }).exc_type === "AuthenticationError"
    ) {
      emitSessionInvalid();
    }
    return response;
  },
  (error: AxiosError<{ exc_type?: string }>) => {
    const url = error.config?.url ?? "";
    const isLoginAttempt = url.includes("/api/method/login");
    const status = error.response?.status;
    const excType = error.response?.data?.exc_type;
    if (
      !isLoginAttempt &&
      (status === 401 || excType === "AuthenticationError")
    ) {
      emitSessionInvalid();
    }
    return Promise.reject(error);
  }
);

export type BinRecord = {
  item_code: string;
  actual_qty: number;
};

function extractFrappeServerMessages(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return undefined;
    const parts = arr.map((item) => {
      if (typeof item === "string") {
        try {
          const o = JSON.parse(item) as { message?: string };
          return typeof o.message === "string" ? o.message : item;
        } catch {
          return item;
        }
      }
      return String(item);
    });
    const joined = parts.filter(Boolean).join("\n").trim();
    return joined || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Frappe often returns HTTP 200 with errors in the JSON body (`exc`, `exception`).
 * Use this after POST /api/method/* to detect failed saves.
 */
export function getFrappeSuccessResponseError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.exc_type && d.exc_type !== "") {
    const ex = d.exception;
    if (typeof ex === "string" && ex.trim()) return ex.trim();
    return String(d.exc_type);
  }
  if (typeof d.exception === "string" && d.exception.trim()) return d.exception.trim();
  if (typeof d.exc === "string" && d.exc.trim()) {
    const s = d.exc.trim();
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "string") {
        return parsed[0].slice(0, 800);
      }
    } catch {
      /* raw traceback string */
    }
    return s.slice(0, 800);
  }
  if (typeof d._server_messages === "string") {
    try {
      const arr = JSON.parse(d._server_messages) as unknown;
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item !== "string") continue;
          try {
            const o = JSON.parse(item) as { raise_exception?: number; message?: string };
            if (o.raise_exception === 1 && typeof o.message === "string" && o.message.trim()) {
              return o.message.trim().slice(0, 800);
            }
          } catch {
            /* */
          }
        }
      }
    } catch {
      /* */
    }
  }
  return null;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<Record<string, unknown>>;
  const data = axiosError.response?.data;
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const msg = data.message;
  const messageStr = typeof msg === "string" ? msg : undefined;
  const exceptionStr = typeof data.exception === "string" ? data.exception : undefined;
  const excStr = typeof data.exc === "string" ? data.exc : undefined;
  const serverMessages = extractFrappeServerMessages(data._server_messages);

  const apiMessage =
    messageStr ||
    serverMessages ||
    exceptionStr ||
    (excStr ? excStr.split("\n").pop()?.trim() : undefined);

  return apiMessage ? `${fallback}\n\n${apiMessage}` : fallback;
}
