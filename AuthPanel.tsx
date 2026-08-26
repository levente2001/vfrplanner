import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { X } from "lucide-react";
import { getFirebaseServices } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

type Props = {
  onUserChange: (user: User | null) => void;
  className?: string;
};

export function AuthPanel({ onUserChange, className }: Props) {
  const services = useMemo(() => getFirebaseServices(), []);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!services) {
      onUserChange(null);
      return;
    }
    return onAuthStateChanged(services.auth, (nextUser) => {
      setUser(nextUser);
      onUserChange(nextUser);
    });
  }, [services, onUserChange]);

  async function submit(mode: "login" | "register") {
    if (!services) {
      setError("Firebase config is missing.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(services.auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(services.auth, email.trim(), password);
      }
      setPassword("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!isFirebaseConfigured()) {
    return (
      <div className={cn("px-5 text-right", className)}>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Firebase
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">Config missing</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className={cn("flex items-center justify-end gap-3 px-5", className)}>
        <div className="min-w-0 text-right">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Signed in
          </p>
          <p className="mt-1 max-w-40 truncate font-mono text-xs">{user.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => services && signOut(services.auth)}>
          Logout
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("px-5 text-right", className)}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Login
      </Button>
      {open && (
        <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/75 px-4 text-left">
          <div className="relative w-full max-w-md rounded-md border border-border bg-background p-6 text-foreground shadow-2xl">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setOpen(false)}
              aria-label="Close login"
            >
              <X className="size-4" />
            </button>
            <div className="mb-5">
              <h2 className="text-lg font-semibold">Account</h2>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit("login");
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="authEmail">Email</Label>
                <Input
                  id="authEmail"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authPassword">Password</Label>
                <Input
                  id="authPassword"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit" disabled={busy}>
                  Login
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  variant="outline"
                  onClick={() => submit("register")}
                >
                  Register
                </Button>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
