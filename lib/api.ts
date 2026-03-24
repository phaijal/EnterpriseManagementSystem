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
