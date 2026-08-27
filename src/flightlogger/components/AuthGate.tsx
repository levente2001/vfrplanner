/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import type { User } from "firebase/auth";

export const FLIGHTLOGGER_TOKEN_HELP_URL =
  "https://my.flightlogger.net/api_keys";

export function useFlightLoggerToken(user: User | null) {
  const [apiToken, setApiToken] = useState("");
  const storageKey = user ? `flightlogger-api-token:${user.uid}` : "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiToken(storageKey ? (localStorage.getItem(storageKey) ?? "") : "");
  }, [storageKey]);

  function saveToken(token: string) {
    const cleaned = token.trim();
    if (!storageKey) return;
    if (cleaned) {
      localStorage.setItem(storageKey, cleaned);
    } else {
      localStorage.removeItem(storageKey);
    }
    setApiToken(cleaned);
  }

  return { apiToken, saveToken };
}

export function FlightLoggerGate({
  user,
  apiToken,
  featureName,
  children,
  onSaveToken,
}: {
  user: User | null;
  apiToken: string;
  featureName: string;
  children: ReactNode;
  onSaveToken: (token: string) => void;
}) {
  if (!user) {
    return (
      <FlightLoggerAccessCard
        title="Sign in required"
        description={`Sign in with your VFR Tools account before using ${featureName}. After that, you can add your own FlightLogger API token.`}
      />
    );
  }

  if (!apiToken) {
    return (
      <FlightLoggerTokenSetup
        featureName={featureName}
        userEmail={user.email}
        onSave={onSaveToken}
      />
    );
  }

  return children;
}

function FlightLoggerAccessCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center px-3 py-10">
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-700 text-white">
          <ShieldCheck size={24} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
      </div>
    </div>
  );
}

function FlightLoggerTokenSetup({
  featureName,
  userEmail,
  onSave,
}: {
  featureName: string;
  userEmail: string | null;
  onSave: (token: string) => void;
}) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) {
      setError(`Enter your FlightLogger API token to load ${featureName}.`);
      return;
    }
    setError("");
    onSave(cleaned);
  }

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-3xl items-center justify-center px-3 py-10">
      <div className="grid w-full gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-700 text-white">
            <KeyRound size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-800">
            FlightLogger
          </p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-950">
            Your API token is required
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            This feature loads FlightLogger data with your own token. The token
            is stored in your browser, separated by signed-in user, and is sent
            only to the server-side proxy.
          </p>
          {userEmail ? (
            <p className="mt-2 text-xs text-zinc-500">
              Signed in as: {userEmail}
            </p>
          ) : null}

          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm font-semibold text-zinc-800">
              FlightLogger API token
              <input
                className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-950 outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error ? (
              <p className="text-sm font-medium text-rose-700">{error}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                Save token
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-cyan-600 hover:text-cyan-800"
                onClick={() => setShowToken((visible) => !visible)}
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-lg border border-cyan-100 bg-cyan-50 p-4">
          <h2 className="text-sm font-bold text-zinc-950">
            How to create a token
          </h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
            <li>1. Open the FlightLogger API keys page.</li>
            <li>2. Sign in to your FlightLogger account.</li>
            <li>3. Create or generate a new API token.</li>
            <li>4. Paste it here, then save it.</li>
          </ol>
          <a
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
            href={FLIGHTLOGGER_TOKEN_HELP_URL}
            target="_blank"
            rel="noreferrer"
          >
            Generate token
            <ExternalLink size={16} />
          </a>
        </aside>
      </div>
    </div>
  );
}
