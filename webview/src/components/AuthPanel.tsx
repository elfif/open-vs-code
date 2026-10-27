import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { postToExtension } from "@/lib/vscode";

interface AuthPanelProps {
  readonly serverUrl?: string;
  readonly error?: string;
  readonly submitting: boolean;
}

export function AuthPanel({ serverUrl, error, submitting }: AuthPanelProps) {
  const [url, setUrl] = useState(serverUrl ?? "http://localhost:4096");
  const [password, setPassword] = useState("");

  return (
    <Card className="m-3">
      <CardHeader>
        <h2 className="text-sm font-semibold">Connect to OpenCode</h2>
        <p className="text-xs text-muted-foreground">
          Start the OpenCode server before connecting. The extension talks directly to the OpenCode
          HTTP API and does not start the server for you.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            postToExtension({ type: "authenticate", serverUrl: url, password });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">OpenCode server URL</span>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://localhost:4096"
              autoComplete="url"
              spellCheck={false}
              disabled={submitting}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              disabled={submitting}
            />
          </label>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting || !url.trim()}>
            {submitting ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
