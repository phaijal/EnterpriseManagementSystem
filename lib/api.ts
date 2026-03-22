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

export function getApiErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ message?: string; exception?: string }>;
  const apiMessage =
    axiosError.response?.data?.message || axiosError.response?.data?.exception;

  return apiMessage ? `${fallback}\n${apiMessage}` : fallback;
}
