import { useEffect, useRef, useState } from "react";
import { Languages, Square, Copy, CheckCheck, FilePlus2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  TRANSLATE_TARGETS,
  type TranslateTarget,
  translate,
} from "@/lib/writingAssist";

export default function TranslateDialog({
  open,
  onClose,
  docTitle,
  original,
  onSaveCopy,
}: {
  open: boolean;
  onClose: () => void;
  docTitle: string;
  original: string;
  onSaveCopy: (title: string, body: string) => Promise<void>;
}) {
  const [target, setTarget] = useState<TranslateTarget>("English");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function run(lang: string) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(false);
    setSaved(false);
    setText("");
    let acc = "";
    try {
      await translate({
        text: original,
        target: lang,
        signal: ac.signal,
        onToken: (t) => {
          acc += t;
          setText(acc.trimStart());
        },
      });
    } catch {
      if (ac.signal.aborted) return;
      setError(true);
    }
    if (!ac.signal.aborted) setBusy(false);
  }

  // Translate when the dialog opens.
  useEffect(() => {
    if (open) run(target);
    else abortRef.current?.abort();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeTarget(lang: TranslateTarget) {
    setTarget(lang);
    run(lang);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function saveCopy() {
    await onSaveCopy(`${docTitle.trim() || "Untitled"} (${target})`, text.trim());
    setSaved(true);
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-5xl">
      <div className="mb-4 flex items-center gap-3 pr-8">
        <Languages className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Translate</h2>
        <select
          value={target}
          onChange={(e) => changeTarget(e.target.value as TranslateTarget)}
          disabled={busy}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {TRANSLATE_TARGETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => abortRef.current?.abort()}
          >
            <Square className="size-3.5" />
            Stop
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="mb-1 text-xs font-medium text-muted-foreground">
            Original
          </span>
          <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-7">
            {original}
          </div>
        </div>
        <div className="flex flex-col">
          <span className="mb-1 text-xs font-medium text-muted-foreground">
            {target}
          </span>
          <div className="max-h-[55vh] min-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border px-3 py-2 text-sm leading-7">
            {error ? (
              <span className="text-red-600">
                Couldn't reach the model. Is Ollama running?
              </span>
            ) : text ? (
              text
            ) : (
              <span className="text-muted-foreground">Translating…</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          disabled={busy || !text.trim()}
        >
          {copied ? (
            <CheckCheck className="size-4 text-green-600" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" onClick={saveCopy} disabled={busy || !text.trim()}>
          <FilePlus2 className="size-4" />
          {saved ? "Saved ✓" : "Save as new document"}
        </Button>
      </div>
    </Dialog>
  );
}
