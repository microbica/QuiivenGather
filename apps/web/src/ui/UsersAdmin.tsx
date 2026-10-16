import React from "react";
import { deleteUser, listUsers, setUserRole, type AdminUser } from "../api/admin";

const inputStyle: React.CSSProperties = { margin: "10px 0 0" };

/** Gestión de cuentas y roles (tabla `users`). Crear ocurre por login Google; aquí se lista, promueve/degrada y borra. */
export function UsersAdmin({ myEmail }: { myEmail: string }) {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [msg, setMsg] = React.useState("");

  const refresh = React.useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      setUsers(await listUsers());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(""), 2500);
  };

  const toggleRole = async (u: AdminUser) => {
    const next = u.role === "admin" ? "user" : "admin";
    setErr("");
    try {
      const updated = await setUserRole(u.email, next);
      setUsers((prev) => prev.map((x) => (x.email === u.email ? updated : x)));
      flash(`${u.email} → ${next}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`¿Eliminar la cuenta ${u.email}? Se borra su estado guardado y su sesión de Google.`)) {
      return;
    }
    setErr("");
    try {
      await deleteUser(u.email);
      setUsers((prev) => prev.filter((x) => x.email !== u.email));
      flash(`Eliminado: ${u.email}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="q-panel" aria-label="Cuentas y roles">
      <h3 className="q-eyebrow">
        <span>Usuarios · {users.length}</span>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => void refresh()} disabled={busy}>
          {busy ? "…" : "Recargar"}
        </button>
      </h3>
      <p className="q-small q-muted" style={inputStyle}>
        Las cuentas se crean solas al entrar con Google. Aquí defines el rol: solo
        <strong> admin </strong> puede editar el mapa, publicar en la TV y abrir esta página.
      </p>
      {err && <p className="q-small" style={{ color: "var(--q-flame)" }}>{err}</p>}
      {msg && <p className="q-small" style={{ color: "var(--q-teal-dark)" }}>{msg}</p>}
      <ul className="q-admin__list">
        {users.map((u) => {
          const self = u.email.toLowerCase() === myEmail.toLowerCase();
          return (
            <li key={u.email}>
              <span className="q-chip">{u.role}</span>
              <span className="q-small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.email}
                {self && <span className="q-muted"> (tú)</span>}
              </span>
              <button
                type="button"
                className="q-btn q-btn--ghost q-btn--sm"
                onClick={() => void toggleRole(u)}
                disabled={self}
                title={self ? "No puedes cambiar tu propio rol" : u.role === "admin" ? "Degradar a user" : "Promover a admin"}
              >
                {u.role === "admin" ? "⇩ user" : "⇧ admin"}
              </button>
              <button
                type="button"
                className="q-btn q-btn--ghost q-btn--sm"
                onClick={() => void remove(u)}
                disabled={self}
                title={self ? "No puedes eliminarte a ti mismo" : `Eliminar ${u.email}`}
                style={{ color: "var(--q-flame)" }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {users.length === 0 && !busy && !err && (
        <p className="q-small q-muted">Sin cuentas todavía.</p>
      )}
    </section>
  );
}
