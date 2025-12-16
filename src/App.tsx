import { useState, useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import { SessionsPage } from "@/pages/sessions";
import { ProjectDetailPage } from "@/pages/project-detail";
import { SettingsPage } from "@/pages/settings";
import { StyleGuidePage } from "@/pages/style-guide";
import { getProjectPathFromUrl, openProjectWindow, showCurrentWindow } from "@/lib/windows";

type Page = "projects" | "settings" | "style-guide";

// Check if this window is a project detail window
const projectPath = getProjectPathFromUrl();

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("projects");

  // Show window after mount (prevents white flash)
  useEffect(() => {
    showCurrentWindow();
  }, []);

  // If this is a project window, render only the project detail page
  if (projectPath) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="agent-console-theme">
        <div className="h-screen flex flex-col bg-background text-foreground">
          <ProjectDetailPage projectPath={projectPath} />
        </div>
      </ThemeProvider>
    );
  }

  // Main window rendering
  return (
    <ThemeProvider defaultTheme="system" storageKey="agent-console-theme">
      <div className="h-screen flex flex-col bg-background text-foreground">
        <Header onNavigate={setCurrentPage} />
        <div className="flex-1 overflow-hidden">
          {currentPage === "projects" && (
            <SessionsPage onSelectProject={openProjectWindow} />
          )}
          {currentPage === "settings" && (
            <SettingsPage onBack={() => setCurrentPage("projects")} />
          )}
          {currentPage === "style-guide" && <StyleGuidePage />}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
