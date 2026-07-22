import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BRAND_TAGLINE } from "../brand";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "../components/AppLogo";
import { ThemeSwitcher } from "../components/ThemeSwitcher";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="login-card card">
      <div className="login-card__brand">
        <AppLogo variant="full" size="lg" color="var(--accent)" />
        <p className="login-card__tagline">{BRAND_TAGLINE}</p>
      </div>
      <h1 className="page-title login-card__title">Sign in</h1>
      <p className="page-lead login-card__lead">
        Use the email currently on your profile (if you changed it from the seed default, the old
        address will not work). Password is the one you set under Profile.
      </p>
      {passwordChanged && (
        <p
          role="status"
          style={{
            marginTop: 0,
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
          }}
        >
          Password updated. Sign in with your new password.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setPending(true);
          try {
            const result = await login(email, password);
            if (result.type === "passwordChange") {
              navigate("/login/change-password", { replace: true });
            } else {
              navigate("/", { replace: true });
            }
          } catch {
            setErr("Invalid email or password.");
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="em">Email</label>
          <input
            id="em"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {err && (
          <p role="alert" style={{ marginTop: 0 }}>
            {err}
          </p>
        )}
        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
      <div className="login-card__theme" aria-label="Appearance">
        <ThemeSwitcher compact />
      </div>
    </div>
  );
}
