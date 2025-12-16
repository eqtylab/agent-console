import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ActiveSessionsResult } from "./types";

interface UseActiveSessionsResult {
  /** Set of project paths with active sessions */
  activePaths: Set<string>;
  /** Whether this feature is supported on the current platform */
  supported: boolean;
  /** Check if a project path has an active session */
  isActive: (projectPath: string) => boolean;
  /** Refresh the active sessions */
  refresh: () => void;
}

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds

export function useActiveSessions(): UseActiveSessionsResult {
  const [activePaths, setActivePaths] = useState<Set<string>>(new Set());
  const [supported, setSupported] = useState(true);

  const fetchActiveSessions = useCallback(async () => {
    try {
      const result = await invoke<ActiveSessionsResult>("get_active_sessions");
      setSupported(result.supported);
      if (result.supported) {
        setActivePaths(new Set(result.activePaths));
      }
    } catch {
      // If the command fails, assume not supported
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchActiveSessions();

    // Poll periodically
    const interval = setInterval(fetchActiveSessions, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchActiveSessions]);

  const isActive = useCallback(
    (projectPath: string) => activePaths.has(projectPath),
    [activePaths]
  );

  return {
    activePaths,
    supported,
    isActive,
    refresh: fetchActiveSessions,
  };
}
