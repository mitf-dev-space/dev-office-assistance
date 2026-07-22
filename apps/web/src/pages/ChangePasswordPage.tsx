import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BRAND_TAGLINE } from "../brand";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "../components/AppLogo";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useApi } from "../useApi";

export function ChangePasswordPage() {
  const { logout, user } = useAuth();
  const { request } = useApi();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="login-card card">
      <div className="login-card__brand">
        <AppLogo variant="full" size="lg" color="var(--accent)" />
        <p className="login-card__tagline">{BRAND_TAGLINE}</p>
      </div>
      <h1 className="page-title login-card__title">Set a new password</h1>
      <p className="page-lead login-card__lead">
        {user?.email
          ? `Your account (${user.email}) requires a new password before you can continue. You will sign in again afterward.`
          : "Your account requires a new password before you can continue. You will sign in again afterward."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (newPassword.length < 8) {
            setErr("Password must be at least 8 characters.");
            return;
          }
          if (newPassword !== confirm) {
            setErr("Passwords do not match.");
            return;
          }
          setPending(true);
          try {
            const res = await request("/api/auth/complete-password-change", {
              method: "POST",
              body: JSON.stringify({ newPassword }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              message?: string;
            };
            if (!res.ok) {
              setErr(data.message ?? data.error ?? "Failed to update password.");
              return;
            }
            logout();
            navigate("/login?passwordChanged=1", { replace: true });
          } catch {
            setErr("Failed to update password.");
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="new-pw">New password</label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-pw">Confirm password</label>
          <input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {err && (
          <p role="alert" style={{ marginTop: 0 }}>
            {err}
          </p>
        )}
        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </button>
        </div>
      </form>
      <div className="login-card__theme" aria-label="Appearance">
        <ThemeSwitcher compact />
      </div>
    </div>
  );
}
