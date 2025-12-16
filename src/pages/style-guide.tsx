import { Example, ExampleWrapper } from "@/components/example";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconPlus,
  IconSettings,
  IconUser,
  IconBell,
  IconShield,
  IconCode,
  IconBug,
  IconPlayerPlay,
} from "@tabler/icons-react";

export function StyleGuidePage() {
  return (
    <ExampleWrapper>
      <Example title="Typography & Colors" className="items-start">
        <div className="space-y-4 w-full">
          <h1 className="text-2xl font-bold text-foreground">Agent Console</h1>
          <h2 className="text-xl font-semibold text-foreground">Heading 2</h2>
          <h3 className="text-lg font-medium text-foreground">Heading 3</h3>
          <p className="text-sm text-foreground">
            Regular body text in foreground color.
          </p>
          <p className="text-sm text-muted-foreground">
            Muted text for secondary content.
          </p>
          <div className="flex gap-2 flex-wrap">
            <div className="h-8 w-8 rounded bg-primary" title="primary" />
            <div className="h-8 w-8 rounded bg-secondary" title="secondary" />
            <div className="h-8 w-8 rounded bg-accent" title="accent" />
            <div className="h-8 w-8 rounded bg-muted" title="muted" />
            <div
              className="h-8 w-8 rounded bg-destructive"
              title="destructive"
            />
          </div>
        </div>
      </Example>

      <Example title="Buttons" className="items-start">
        <div className="space-y-4 w-full">
          <div className="flex gap-2 flex-wrap">
            <Button>
              <IconPlus data-icon="inline-start" />
              Default
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <Separator />
          <div className="flex gap-2 flex-wrap items-center">
            <Button size="xs">Extra Small</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
          <Separator />
          <div className="flex gap-2 flex-wrap">
            <Button size="icon-xs">
              <IconSettings />
            </Button>
            <Button size="icon-sm">
              <IconSettings />
            </Button>
            <Button size="icon">
              <IconSettings />
            </Button>
            <Button size="icon-lg">
              <IconSettings />
            </Button>
          </div>
        </div>
      </Example>

      <Example title="Badges" className="items-start">
        <div className="flex gap-2 flex-wrap">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Example>

      <Example title="Form Controls" className="items-start">
        <FieldGroup className="w-full">
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" placeholder="Enter your name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <Select defaultValue="">
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="designer">Designer</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="bio">Bio</FieldLabel>
            <Textarea id="bio" placeholder="Tell us about yourself" />
          </Field>
        </FieldGroup>
      </Example>

      <Example title="Cards" className="items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Agent Session</CardTitle>
            <CardDescription>
              Active debugging session for Claude Code agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">Running</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Events</span>
                <span>42</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>2m 34s</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">
              <IconPlayerPlay data-icon="inline-start" />
              Resume
            </Button>
            <Button variant="outline" size="sm">
              Details
            </Button>
          </CardFooter>
        </Card>
      </Example>

      <Example title="Icon Showcase" className="items-start">
        <div className="space-y-4 w-full">
          <p className="text-xs text-muted-foreground">
            Icons from @tabler/icons-react
          </p>
          <div className="flex gap-4 flex-wrap items-center">
            <div className="flex flex-col items-center gap-1">
              <IconUser className="size-5" />
              <span className="text-xs text-muted-foreground">User</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <IconSettings className="size-5" />
              <span className="text-xs text-muted-foreground">Settings</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <IconBell className="size-5" />
              <span className="text-xs text-muted-foreground">Bell</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <IconShield className="size-5" />
              <span className="text-xs text-muted-foreground">Shield</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <IconCode className="size-5" />
              <span className="text-xs text-muted-foreground">Code</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <IconBug className="size-5" />
              <span className="text-xs text-muted-foreground">Bug</span>
            </div>
          </div>
        </div>
      </Example>
    </ExampleWrapper>
  );
}
