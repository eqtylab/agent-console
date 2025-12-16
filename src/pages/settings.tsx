import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import {
  IconPalette,
  IconInfoCircle,
  IconArrowLeft,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconCheck,
  IconTerminal2,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import type { TerminalType } from "@/lib/types";
import { terminalDisplayNames } from "@/lib/types";

type SettingsSection = "appearance" | "terminal" | "about";

export const TERMINAL_STORAGE_KEY = "agent-console:default-terminal";

interface SettingsPageProps {
  onBack: () => void;
}

const navItems: {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: <IconPalette className="size-4" />,
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: <IconTerminal2 className="size-4" />,
  },
  { id: "about", label: "About", icon: <IconInfoCircle className="size-4" /> },
];

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("appearance");

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-48 border-r border-border bg-muted/30 p-3 shrink-0">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <IconArrowLeft className="size-3.5" />
            Back
          </Button>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors",
                activeSection === item.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl">
          {activeSection === "appearance" && <AppearanceSection />}
          {activeSection === "terminal" && <TerminalSection />}
          {activeSection === "about" && <AboutSection />}
        </div>
      </main>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  const themes = [
    {
      id: "light" as const,
      label: "Light",
      icon: <IconSun className="size-5" />,
    },
    {
      id: "dark" as const,
      label: "Dark",
      icon: <IconMoon className="size-5" />,
    },
    {
      id: "system" as const,
      label: "System",
      icon: <IconDeviceDesktop className="size-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Customize how Agent Console looks on your device.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Select your preferred theme for the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                  theme === t.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                {theme === t.id && (
                  <div className="absolute top-2 right-2">
                    <IconCheck className="size-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-md p-2",
                    theme === t.id ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {t.icon}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium",
                    theme === t.id ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TerminalSection() {
  const [availableTerminals, setAvailableTerminals] = useState<TerminalType[]>(
    []
  );
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalType | null>(
    null
  );

  useEffect(() => {
    invoke<TerminalType[]>("get_available_terminals").then((terminals) => {
      setAvailableTerminals(terminals);

      const saved = localStorage.getItem(
        TERMINAL_STORAGE_KEY
      ) as TerminalType | null;
      if (saved && terminals.includes(saved)) {
        setSelectedTerminal(saved);
      } else if (terminals.length > 0) {
        setSelectedTerminal(terminals[0]);
      }
    });
  }, []);

  const handleTerminalChange = (terminal: TerminalType) => {
    setSelectedTerminal(terminal);
    localStorage.setItem(TERMINAL_STORAGE_KEY, terminal);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Terminal</h2>
        <p className="text-sm text-muted-foreground">
          Configure which terminal to use when launching Claude sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Default Terminal</CardTitle>
          <CardDescription>
            Select the terminal emulator to use when starting new Claude
            sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableTerminals.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {availableTerminals.map((terminal) => (
                <button
                  key={terminal}
                  onClick={() => handleTerminalChange(terminal)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg border p-4 transition-colors text-left",
                    selectedTerminal === terminal
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                  )}
                >
                  {selectedTerminal === terminal && (
                    <div className="absolute top-2 right-2">
                      <IconCheck className="size-4 text-primary" />
                    </div>
                  )}
                  <IconTerminal2
                    className={cn(
                      "size-5",
                      selectedTerminal === terminal
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      selectedTerminal === terminal
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {terminalDisplayNames[terminal]}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No supported terminals detected on this system.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">About</h2>
        <p className="text-sm text-muted-foreground">
          Information about Agent Console.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Console</CardTitle>
          <CardDescription>
            A console, command, and control tool for AI coding agents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-medium">0.1.0</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Built with</dt>
              <dd className="font-medium">Tauri + React</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
