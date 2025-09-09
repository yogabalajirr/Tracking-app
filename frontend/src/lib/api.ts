import axios from "axios";
import { API_URL, ACCESS_TOKEN_STORAGE_KEY } from "@/lib/constants";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (token) {
      config.headers = config.headers || {};
      config.headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      const prefix = process.env.NEXT_PUBLIC_BASE_PATH || "";
      window.location.href = `${prefix}/login`;
    }
    return Promise.reject(error);
  }
);

export default api;



