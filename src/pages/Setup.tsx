import { useEffect, useState } from "react";
import {
  Rocket,
  Download,
  Cpu,
  Mic,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ping, getModels } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { isRecordingSupported } from "@/lib/recorder";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function openExternal(url: string) {
  const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
  const w = window as unknown as { __TAURI__?: unknown };
  if (w.__TAURI__) {
    import("@tauri-apps/plugin-opener")
      .then((m) => m.openUrl(full))
      .catch(() => window.open(full, "_blank", "noopener"));
  } else {
    window.open(full, "_blank", "noopener");
  }
}

type Check = "checking" | "ok" | "missing";

function StatusPill({ state, label }: { state: Check; label?: string }) {
  if (state === "checking")
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking…
      </span>
    );
  if (state === "ok")
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
        <CheckCircle2 className="size-4" />
        {label ?? "Ready"}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
      <XCircle className="size-4" />
      {label ?? "Not detected"}
    </span>
  );
}

function CommandLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm">
      <span className="flex-1 select-all">{cmd}</span>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(cmd);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Copy command"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export default function Setup() {
  const [ollama, setOllama] = useState<Check>("checking");
  const [modelOk, setModelOk] = useState<Check>("checking");
  const model = getSettings().model;
  const voiceSupported = isRecordingSupported();

  async function refresh() {
    setOllama("checking");
    setModelOk("checking");
    const up = await ping();
    setOllama(up ? "ok" : "missing");
    if (!up) {
      setModelOk("missing");
      return;
    }
    try {
      const models = await getModels();
      const base = model.split(":")[0];
      setModelOk(
        models.some((m) => m === model || m.split(":")[0] === base)
          ? "ok"
          : "missing",
      );
    } catch {
      setModelOk("missing");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <Rocket className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Getting started</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        AuthorHub runs its AI entirely on this computer. Two quick, free
        one-time installs and you're set — everything stays private on the
        machine.
      </p>

      <div className="space-y-4">
        {/* Step 1 — Ollama */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Download className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">1. Install Ollama</h2>
                  <StatusPill
                    state={ollama}
                    label={ollama === "ok" ? "Connected" : "Not running"}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ollama is the free engine that runs the assistant locally.
                  Download it, install, and leave it running in the background.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openExternal("https://ollama.com/download")}
                  >
                    <ExternalLink className="size-4" />
                    Download Ollama
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 — model */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Cpu className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">2. Add the AI model</h2>
                  <StatusPill
                    state={modelOk}
                    label={modelOk === "ok" ? "Installed" : "Missing"}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once Ollama is running, open a terminal and pull the model the
                  assistant uses ({model}). It downloads once.
                </p>
                <CommandLine cmd={`ollama pull ${model}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3 — voice (optional) */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mic className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">
                    3. Voice input{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </h2>
                  <StatusPill
                    state={voiceSupported ? "ok" : "missing"}
                    label={voiceSupported ? "Supported" : "No microphone"}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  The mic button in the Assistant lets you speak instead of
                  type. The first time you use it, the app downloads a small
                  speech model (~75MB) once — after that it works fully offline.
                  Allow microphone access when asked.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="outline" onClick={refresh}>
          <Loader2 className={cn("size-4", ollama === "checking" && "animate-spin")} />
          Re-check
        </Button>
        <Link to="/assistant" className={cn(buttonVariants())}>
          Open the assistant
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
