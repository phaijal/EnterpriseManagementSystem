import axios from "axios";
import { AxiosError } from "axios";

export const api = axios.create({
  // Use a local proxy route to avoid browser CORS issues.
  baseURL: "/api/erpnext",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

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
