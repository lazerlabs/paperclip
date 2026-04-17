import { useEffect, useState } from "react";
import type { CompanySecret, EnvBinding } from "@paperclipai/shared";
import { cn } from "../lib/utils";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function readPlainValue(binding: EnvBinding | undefined): string {
  if (typeof binding === "string") return binding;
  if (
    typeof binding === "object" &&
    binding !== null &&
    "type" in binding &&
    binding.type === "plain" &&
    typeof binding.value === "string"
  ) {
    return binding.value;
  }
  return "";
}

function readSecretId(binding: EnvBinding | undefined): string {
  if (
    typeof binding === "object" &&
    binding !== null &&
    "type" in binding &&
    binding.type === "secret_ref" &&
    typeof binding.secretId === "string"
  ) {
    return binding.secretId;
  }
  return "";
}

function defaultSecretName(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function CredentialBindingField({
  label,
  binding,
  secrets,
  onCreateSecret,
  onChange,
  placeholder,
}: {
  label: string;
  binding: EnvBinding | undefined;
  secrets: CompanySecret[];
  onCreateSecret: (name: string, value: string) => Promise<CompanySecret>;
  onChange: (binding: EnvBinding | undefined) => void;
  placeholder?: string;
}) {
  const [showValue, setShowValue] = useState(false);
  const [plainValue, setPlainValue] = useState(() => readPlainValue(binding));
  const [secretId, setSecretId] = useState(() => readSecretId(binding));
  const [mode, setMode] = useState<"plain" | "secret">(
    readSecretId(binding) ? "secret" : "plain",
  );
  const [sealError, setSealError] = useState<string | null>(null);

  useEffect(() => {
    setPlainValue(readPlainValue(binding));
    setSecretId(readSecretId(binding));
    setMode(readSecretId(binding) ? "secret" : "plain");
  }, [binding]);

  async function handleSeal() {
    if (!plainValue) return;
    const suggested = defaultSecretName(label) || "secret";
    const name = window.prompt("Secret name", suggested)?.trim();
    if (!name) return;
    try {
      setSealError(null);
      const created = await onCreateSecret(name, plainValue);
      setSecretId(created.id);
      setMode("secret");
      onChange({ type: "secret_ref", secretId: created.id, version: "latest" });
    } catch (error) {
      setSealError(error instanceof Error ? error.message : "Failed to create secret");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-muted/20 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors",
              mode === "plain" ? "bg-background text-foreground" : "text-muted-foreground",
            )}
            onClick={() => {
              setMode("plain");
              onChange({ type: "plain", value: plainValue });
            }}
          >
            Direct
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors",
              mode === "secret" ? "bg-background text-foreground" : "text-muted-foreground",
            )}
            onClick={() => {
              setMode("secret");
              onChange(
                secretId
                  ? { type: "secret_ref", secretId, version: "latest" }
                  : undefined,
              );
            }}
          >
            Secret
          </button>
        </div>
      </div>

      {mode === "secret" ? (
        <select
          className={cn(inputClass, "bg-background")}
          value={secretId}
          onChange={(event) => {
            const nextSecretId = event.target.value;
            setSecretId(nextSecretId);
            onChange(
              nextSecretId
                ? { type: "secret_ref", secretId: nextSecretId, version: "latest" }
                : undefined,
            );
          }}
        >
          <option value="">Select secret...</option>
          {secrets.map((secret) => (
            <option key={secret.id} value={secret.id}>
              {secret.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <input
            className={cn(inputClass, "flex-1")}
            type={showValue ? "text" : "password"}
            value={plainValue}
            placeholder={placeholder}
            onChange={(event) => {
              const nextValue = event.target.value;
              setPlainValue(nextValue);
              onChange(nextValue ? { type: "plain", value: nextValue } : undefined);
            }}
          />
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50"
            onClick={() => setShowValue((current) => !current)}
          >
            {showValue ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50"
            onClick={() => void handleSeal()}
            disabled={!plainValue}
          >
            Seal
          </button>
        </div>
      )}

      {sealError && <p className="text-[11px] text-destructive">{sealError}</p>}
    </div>
  );
}
