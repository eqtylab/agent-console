import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import {
  IconArrowRight,
  IconLoader2,
  IconChevronDown,
  IconFolderOpen,
  IconTerminal2,
  IconSquareRoundedPlus,
} from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invoke } from "@tauri-apps/api/core";
import { useProjects } from "@/lib/use-projects";
import { useActiveSessions } from "@/lib/use-active-sessions";
import type { AgentType, TerminalType } from "@/lib/types";
import { TERMINAL_STORAGE_KEY } from "@/pages/settings";
import { terminalDisplayNames } from "@/lib/types";

const INITIAL_DISPLAY_COUNT = 8;

// Agent icons
import claudeLight from "@/assets/agents/claude-light.svg";
import claudeDark from "@/assets/agents/claude-dark.svg";
import cursorLight from "@/assets/agents/cursor-light.svg";
import cursorDark from "@/assets/agents/cursor-dark.svg";
import opencodeLight from "@/assets/agents/opencode-wordmark-light.svg";
import opencodeDark from "@/assets/agents/opencode-wordmark-dark.svg";

const agentIcons: Record<AgentType, { light: string; dark: string }> = {
  "claude-code": { light: claudeLight, dark: claudeDark },
  cursor: { light: cursorLight, dark: cursorDark },
  opencode: { light: opencodeLight, dark: opencodeDark },
};

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme();
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

interface SessionsPageProps {
  onSelectProject: (projectPath: string) => void;
}

export function SessionsPage({ onSelectProject }: SessionsPageProps) {
  const resolvedTheme = useResolvedTheme();
  const { projects, loading, error } = useProjects();
  const { supported: activeSessionsSupported, isActive } = useActiveSessions();
  const [showAll, setShowAll] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalType | null>(
    null
  );

  // Load terminal preference from settings
  useEffect(() => {
    invoke<TerminalType[]>("get_available_terminals").then((terminals) => {
      const saved = localStorage.getItem(TERMINAL_STORAGE_KEY) as TerminalType | null;
      if (saved && terminals.includes(saved)) {
        setSelectedTerminal(saved);
      } else if (terminals.length > 0) {
        setSelectedTerminal(terminals[0]);
      }
    });
  }, []);

  const launchClaude = async (
    projectPath: string,
    continueSession: boolean,
    yoloMode: boolean
  ) => {
    if (!selectedTerminal) return;
    try {
      await invoke("launch_claude", {
        terminalType: selectedTerminal,
        projectPath,
        continueSession,
        yoloMode,
      });
    } catch (err) {
      console.error("Failed to launch Claude:", err);
    }
  };

  const displayedProjects = showAll
    ? projects
    : projects.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = projects.length > INITIAL_DISPLAY_COUNT;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-destructive">Failed to load projects</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Active and recent agent sessions by project
            </p>
          </div>

        {projects.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_72px_80px_100px_68px] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
              <div>Project</div>
              <div>Agent</div>
              <div className="text-right">Sessions</div>
              <div className="text-right">Last Active</div>
              <div></div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border">
              {displayedProjects.map((project) => {
                const projectIsActive = isActive(project.projectPath);
                return (
                <div
                  key={project.projectPath}
                  className="grid grid-cols-[1fr_72px_80px_100px_68px] gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group items-center"
                >
                  {/* Project - clickable */}
                  <button
                    onClick={() => onSelectProject(project.projectPath)}
                    className="min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {project.projectName}
                      </span>
                      <IconArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {project.projectPath}
                    </div>
                  </button>

                  {/* Agent Icon */}
                  <div className="flex items-center">
                    <img
                      src={agentIcons[project.agentType][resolvedTheme]}
                      alt={project.agentType}
                      className="h-3 w-auto"
                    />
                  </div>

                  {/* Session Count */}
                  <div className="flex items-center justify-end">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {project.sessionCount}
                    </Badge>
                  </div>

                  {/* Last Activity */}
                  <div className="flex items-center justify-end text-sm text-muted-foreground">
                    {formatRelativeTime(project.lastActivity)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    {activeSessionsSupported && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            <IconTerminal2
                              className={`size-4 ${
                                projectIsActive
                                  ? "text-green-500"
                                  : "text-muted-foreground/40"
                              }`}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {projectIsActive ? "Active session" : "No active session"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {selectedTerminal && (
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <IconSquareRoundedPlus className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>New session</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onClick={() =>
                              launchClaude(project.projectPath, false, false)
                            }
                          >
                            <IconTerminal2 className="size-4" />
                            New session
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              launchClaude(project.projectPath, false, true)
                            }
                          >
                            <IconTerminal2 className="size-4" />
                            New session (YOLO)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>
                            Or continue last session
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() =>
                              launchClaude(project.projectPath, true, false)
                            }
                          >
                            <IconTerminal2 className="size-4" />
                            Continue session
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              launchClaude(project.projectPath, true, true)
                            }
                          >
                            <IconTerminal2 className="size-4" />
                            Continue session (YOLO)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        invoke("reveal_in_file_manager", {
                          path: project.projectPath,
                        });
                      }}
                      title="Reveal in file manager"
                    >
                      <IconFolderOpen className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Show more button */}
            {hasMore && !showAll && (
              <div className="px-4 py-3 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(true)}
                  className="w-full text-muted-foreground hover:text-foreground"
                >
                  <IconChevronDown className="size-4 mr-2" />
                  Show {projects.length - INITIAL_DISPLAY_COUNT} more projects
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground border border-border rounded-lg">
            <p className="text-sm">No projects found</p>
            <p className="text-xs mt-1">
              Claude Code sessions will appear here
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-1 flex items-center justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
              <IconTerminal2 className="size-3" />
              <span>{selectedTerminal ? terminalDisplayNames[selectedTerminal] : "No terminal"}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Default terminal set to: {selectedTerminal ? terminalDisplayNames[selectedTerminal] : "None"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
