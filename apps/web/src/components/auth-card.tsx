import { useState } from "react";
import { KeyRound } from "lucide-react";
import { authClient } from "#/lib/auth-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

type View = "auth" | "forgot-password" | "forgot-password-sent" | "signup-check-email";

interface AuthCardProps {
  redirectTo?: string;
  /** Whether Google sign-in is configured (Admin > Auth, or env vars) - resolved by the root route, see __root.tsx. */
  hasGoogleAuth: boolean;
}

// BetterAuth builds verification/reset-password/OAuth callback links
// server-side, resolving a relative callbackURL against its own baseURL -
// the API's origin, now that auth lives there rather than in this app. So
// what we hand it here has to be an absolute URL pointing back at *this*
// app, or a signed-out browser ends up sent to the API's origin instead of
// the web app after clicking the link.
function toAbsoluteUrl(path: string) {
  return `${window.location.origin}${path}`;
}

export function AuthCard({ redirectTo = "/library", hasGoogleAuth }: AuthCardProps) {
  const [view, setView] = useState<View>("auth");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  function resetMessages() {
    setError(null);
    setInfo(null);
    setUnverifiedEmail(null);
  }

  async function submit(mode: "signin" | "signup", formEl: HTMLFormElement) {
    resetMessages();
    setLoading(true);

    const form = new FormData(formEl);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "");

    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name, callbackURL: toAbsoluteUrl(redirectTo) })
        : await authClient.signIn.email({ email, password, callbackURL: toAbsoluteUrl(redirectTo) });

    setLoading(false);

    if (result.error) {
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email);
        setError("Please verify your email before signing in.");
        return;
      }
      setError(result.error.message ?? "Something went wrong");
      return;
    }

    if (mode === "signup" && !result.data.token) {
      // requireEmailVerification is on, so sign-up never creates a session
      // directly - the account exists but needs the emailed link clicked.
      setView("signup-check-email");
      return;
    }
    window.location.href = redirectTo;
  }

  async function resendVerification() {
    if (!unverifiedEmail) return;
    resetMessages();
    setLoading(true);
    const result = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: toAbsoluteUrl(redirectTo),
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    setInfo("Verification email sent - check your inbox.");
  }

  async function requestReset(formEl: HTMLFormElement) {
    resetMessages();
    setLoading(true);
    const form = new FormData(formEl);
    const email = String(form.get("email"));
    const result = await authClient.requestPasswordReset({ email, redirectTo: toAbsoluteUrl("/reset-password") });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    setView("forgot-password-sent");
  }

  async function signInWithGoogle() {
    resetMessages();
    await authClient.signIn.social({ provider: "google", callbackURL: toAbsoluteUrl(redirectTo) });
  }

  async function signInWithPasskey() {
    resetMessages();
    setLoading(true);
    const result = await authClient.signIn.passkey();
    setLoading(false);
    if (result?.error) {
      setError(result.error.message ?? "Passkey sign-in failed");
      return;
    }
    window.location.href = redirectTo;
  }

  if (view === "forgot-password" || view === "forgot-password-sent") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            {view === "forgot-password-sent"
              ? "If that email is registered, we've sent a reset link to it."
              : "Enter your email and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === "forgot-password-sent" ? (
            <Button variant="outline" className="w-full" onClick={() => setView("auth")}>
              Back to sign in
            </Button>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void requestReset(event.currentTarget);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input id="forgot-email" name="email" type="email" required autoComplete="email" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setView("auth")}>
                Back to sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  if (view === "signup-check-email") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We've sent a verification link to your inbox. Click it to finish creating your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => setView("auth")}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>Sign in to your account, or create a new one.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs defaultValue="signin" onValueChange={resetMessages}>
          <TabsList className="w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit("signin", event.currentTarget);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="signin-password">Password</Label>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                    onClick={() => {
                      resetMessages();
                      setView("forgot-password");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <Input id="signin-password" name="password" type="password" required autoComplete="current-password" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
              {unverifiedEmail && (
                <Button type="button" variant="outline" size="sm" onClick={() => void resendVerification()} disabled={loading}>
                  Resend verification email
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit("signup", event.currentTarget);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="signup-name">Display name</Label>
                <Input id="signup-name" name="name" required autoComplete="name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {hasGoogleAuth ? (
          <>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => void signInWithGoogle()}>
              Continue with Google
            </Button>
          </>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => void signInWithPasskey()}
          disabled={loading}
        >
          <KeyRound />
          Sign in with a passkey
        </Button>
      </CardContent>
    </Card>
  );
}
