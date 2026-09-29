import { useState, type FormEvent } from "react";

interface Props {
  onSignIn: (username: string, password: string) => Promise<string | null>;
}

export default function Login({ onSignIn }: Props) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(await onSignIn(username, password));
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#05050f] font-['JetBrains_Mono',monospace] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-[320px] rounded-xl border border-white/[0.08] bg-[rgba(8,8,25,0.92)] px-6 py-7 text-[12px] text-white/75 backdrop-blur-xl"
      >
        <div className="mb-1 text-[15px] font-semibold tracking-[3px] text-white/90">GALAXY</div>
        <div className="mb-6 text-[11px] text-white/40">Sign in to see the cluster</div>
        <label className="mb-1 block text-[10px] text-white/50" htmlFor="galaxy-username">
          USERNAME
        </label>
        <input
          id="galaxy-username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-white/90 outline-none focus:border-white/30"
        />
        <label className="mb-1 block text-[10px] text-white/50" htmlFor="galaxy-password">
          PASSWORD
        </label>
        <input
          id="galaxy-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-white/90 outline-none focus:border-white/30"
        />
        {error && (
          <div role="alert" className="mb-4 text-[11px] text-red-300/90">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full rounded-md bg-white/15 py-2 text-white/90 transition-colors hover:bg-white/25 disabled:opacity-40"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
