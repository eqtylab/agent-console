import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Create a stable window label from project path
function getWindowLabel(projectPath: string): string {
  // Simple hash to create a valid window label from path
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `project-${Math.abs(hash).toString(36)}`;
}

export async function openProjectWindow(projectPath: string): Promise<void> {
  const projectName = projectPath.split("/").pop() || "Project";
  const windowLabel = getWindowLabel(projectPath);

  // Check if window already exists
  const existing = await WebviewWindow.getByLabel(windowLabel);
  if (existing) {
    // Focus the existing window
    await existing.setFocus();
    return;
  }

  // Create new window (hidden - will show itself after mount)
  const url = `index.html?project=${encodeURIComponent(projectPath)}`;

  const webview = new WebviewWindow(windowLabel, {
    url,
    title: projectName,
    width: 900,
    height: 700,
    center: true,
    visible: false, // Start hidden to prevent white flash
  });

  // Handle errors
  webview.once("tauri://error", (e) => {
    console.error("Failed to create project window:", e);
  });
}

export function getProjectPathFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("project");
}

// Show the current window (call after frontend mounts)
export async function showCurrentWindow(): Promise<void> {
  await getCurrentWindow().show();
}
