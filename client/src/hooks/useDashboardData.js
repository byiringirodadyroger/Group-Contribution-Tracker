import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import api from "../api";

export function useDashboardData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await api.get("/api/dashboard");
    setData(response.data);
  }, []);

  useEffect(() => {
    let active = true;
    api.get("/api/dashboard").then(({ data: result }) => {
      if (active) setData(result);
    }).catch((e) => {
      if (active) setError(e.response?.data?.message || "Could not load the dashboard.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(socketUrl, { withCredentials: true, transports: ["websocket", "polling"] });
    const update = () => refresh().catch(() => setError("Live update failed. Refresh to retry."));
    socket.on("payment:created", update);
    socket.on("payment:updated", update);
    socket.on("payment:deleted", update);
    socket.on("dashboard:updated", update);
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
