import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Music2 } from "lucide-react";
import { authClient } from "#/lib/auth-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Music2 className="size-6" />
        SongVerse
      </div>
      <ResetPasswordCard />
    </main>
  );
}

function ResetPasswordCard() {
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>This password reset link is missing its token. Request a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Password updated</CardTitle>
          <CardDescription>Your password has been reset. You can now sign in with it.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function submit(formEl: HTMLFormElement) {
    setError(null);
    const form = new FormData(formEl);
    const newPassword = String(form.get("password"));
    const confirmPassword = String(form.get("confirmPassword"));
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    const result = await authClient.resetPassword({ newPassword, token });
    setLoading(false);

    if (result.error) {
      setError(result.error.message ?? "This reset link is invalid or has expired");
      return;
    }
    setDone(true);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Reset password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
