import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconSettings, IconTerminal2, IconPalette } from "@tabler/icons-react";

interface HeaderProps {
  onNavigate: (page: "projects" | "settings" | "style-guide") => void;
}

export function Header({ onNavigate }: HeaderProps) {
  return (
    <header className="bg-background border-b border-border h-10 flex items-center justify-between px-4 shrink-0">
      <button
        onClick={() => onNavigate("projects")}
        className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
      >
        <IconTerminal2 className="size-4" />
        <span>Agent Console</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <IconSettings className="size-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onNavigate("settings")}>
            <IconSettings />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onNavigate("style-guide")}>
            <IconPalette />
            Style Guide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
