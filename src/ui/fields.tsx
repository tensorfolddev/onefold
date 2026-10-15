import { AccessError, ValidationError } from "@/domain/commands";

/** Dry-runs a pure store action to read its message for an inline error (act() would only toast it). */
export function errorOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (e) {
    if (e instanceof ValidationError || e instanceof AccessError) return e.message;
    throw e;
  }
}

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`admin-field${wide ? " is-wide" : ""}`}>
      <span className="admin-field-label">{label}</span>
      {children}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? <p className="admin-error" role="alert">{message}</p> : null;
}
