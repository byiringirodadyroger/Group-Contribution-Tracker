import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  withCredentials: true,
  headers: { "Content-Type": "application/json" }
});

export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const responseMessage = error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.errors?.[0]?.msg;
  if (responseMessage) return responseMessage;
  if (error?.request) return "Could not reach the server. It may be waking up; please try again.";
  return error?.message || fallback;
}

export default api;
