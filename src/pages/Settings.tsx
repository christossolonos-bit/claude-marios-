import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Trash2, ShieldAlert } from "lucide-react";
import {
  type Settings as AppSettings,
  getSettings,
  saveSettings,
  DEFAULT_PERSONA,
} from "@/lib/settings";
import { getModels, getOpenRouterFreeModels } from "@/lib/ollama";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { clearCoachMemory, eraseAllData } from "@/lib/reset";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import CoachMemoryCard from "@/components/CoachMemoryCard";

const selectClass =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [freeModels, setFreeModels] = useState<string[]>([]);
  const [freeModelsError, setFreeModelsError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<null | "memory" | "all">(null);

  useEffect(() => {
    getModels()
      .then(setModels)
      .catch(() => setModelsError(true));
  }, []);

  // Load OpenRouter's usable free models once the cloud provider is selected,
  // so the dropdown only offers reliable, no-cost chat models.
  useEffect(() => {
    if (settings.provider !== "openrouter" || freeModels.length) return;
    getOpenRouterFreeModels()
      .then((m) => {
        setFreeModels(m);
        setFreeModelsError(false);
      })
      .catch(() => setFreeModelsError(true));
  }, [settings.provider, freeModels.length]);

  // Persist on every change so a selection (e.g. the model) can never be lost
  // by navigating away without pressing Save. The Save button stays as an
  // explicit confirmation.
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  function update(patch: Partial<AppSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  }

  function save() {
    saveSettings(settings);
    setSaved(true);
  }

  function runConfirm() {
    if (confirm === "memory") {
      clearCoachMemory();
      window.location.reload();
    } else if (confirm === "all") {
      eraseAllData();
      window.location.href = "/";
    }
  }

  const modelOptions = models.length ? models : [settings.model];
  // Always keep the saved model selectable, and float the recommended default
  // (Llama 3.3 70B) to the top of the list.
  const RECOMMENDED = "meta-llama/llama-3.3-70b-instruct:free";
  const orModelOptions = (
    freeModels.includes(settings.openrouterModel)
      ? freeModels
      : [settings.openrouterModel, ...freeModels]
  ).sort((a, b) => (a === RECOMMENDED ? -1 : b === RECOMMENDED ? 1 : 0));

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <SettingsIcon className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Configure your AI assistant. Your data stays on this device; only the
        text you send is passed to your chosen AI provider.
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Assistant model</CardTitle>
            <CardDescription>
              Run the assistant locally (free, offline) or in the cloud via
              OpenRouter (no install, works on any device — good for a hosted
              deployment).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">AI provider</label>
              <select
                value={settings.provider}
                onChange={(e) =>
                  update({ provider: e.target.value as AppSettings["provider"] })
                }
                className={`${selectClass} mt-1`}
              >
                <option value="ollama">Local — Ollama (offline, free)</option>
                <option value="openrouter">Cloud — OpenRouter (API key)</option>
              </select>
            </div>

            {settings.provider === "ollama" ? (
              <div>
                <label className="text-sm font-medium">Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => update({ model: e.target.value })}
                  className={`${selectClass} mt-1`}
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {modelsError
                    ? "Couldn't reach Ollama — is it running?"
                    : "Auto-detected from your installed Ollama models."}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">
                    OpenRouter API key
                  </label>
                  <Input
                    type="password"
                    value={settings.openrouterApiKey}
                    onChange={(e) =>
                      update({ openrouterApiKey: e.target.value })
                    }
                    className="mt-1"
                    placeholder="sk-or-... (stored only on this device)"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Get one at openrouter.ai. Requests go to OpenRouter's
                    servers.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Model (free only)</label>
                  {freeModelsError ? (
                    <>
                      <Input
                        value={settings.openrouterModel}
                        onChange={(e) =>
                          update({ openrouterModel: e.target.value })
                        }
                        className="mt-1"
                        placeholder="meta-llama/llama-3.3-70b-instruct:free"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Couldn't load the model list. Enter a free model id
                        ending in <code>:free</code> from openrouter.ai/models.
                      </p>
                    </>
                  ) : (
                    <>
                      <select
                        value={settings.openrouterModel}
                        onChange={(e) =>
                          update({ openrouterModel: e.target.value })
                        }
                        className={`${selectClass} mt-1`}
                      >
                        {orModelOptions.map((m) => (
                          <option key={m} value={m}>
                            {m === RECOMMENDED ? `${m} (recommended)` : m}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {freeModels.length
                          ? "Only free models are shown — no charges. Free tier allows ~20 requests/min; if one model is busy, pick another."
                          : "Loading free models…"}
                      </p>
                    </>
                  )}
                </div>
              </>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.useContext}
                onChange={(e) => update({ useContext: e.target.checked })}
                className="mt-0.5"
              />
              Let the assistant see today's tasks and active projects for context
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>General app settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Your name{" "}
                <span className="font-normal text-muted-foreground">
                  (how the assistant greets you)
                </span>
              </label>
              <Input
                value={settings.ownerName}
                onChange={(e) => update({ ownerName: e.target.value })}
                className="mt-1 max-w-xs"
                placeholder="e.g. Marios"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.greetAloud}
                onChange={(e) => update({ greetAloud: e.target.checked })}
                className="mt-0.5"
              />
              Speak the welcome greeting aloud when the app opens
            </label>
            <div>
              <label className="text-sm font-medium">Currency symbol</label>
              <Input
                value={settings.currency}
                onChange={(e) => update({ currency: e.target.value })}
                className="mt-1 w-24"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
            <CardDescription>
              How you're alerted when a task's time arrives (while the app is
              open or minimized).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.reminderSpeak}
                onChange={(e) => update({ reminderSpeak: e.target.checked })}
                className="mt-0.5"
              />
              Speak the reminder aloud (reads the task to you)
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.reminderSound}
                onChange={(e) => update({ reminderSound: e.target.checked })}
                className="mt-0.5"
              />
              Play an alarm chime
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice (Fish Audio)</CardTitle>
            <CardDescription>
              A higher-quality cloud voice. Note: when this is set, the reply
              text is sent to Fish Audio's servers to be spoken. Leave the API
              key blank to use the free, offline local voice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">API key</label>
              <Input
                type="password"
                value={settings.fishApiKey}
                onChange={(e) => update({ fishApiKey: e.target.value })}
                className="mt-1"
                placeholder="Fish Audio API key (stored only on this device)"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Voice ID</label>
              <Input
                value={settings.fishVoiceId}
                onChange={(e) => update({ fishVoiceId: e.target.value })}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coach persona</CardTitle>
            <CardDescription>
              The system prompt that shapes how your assistant behaves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={settings.persona}
              onChange={(e) => update({ persona: e.target.value })}
              rows={7}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ persona: DEFAULT_PERSONA })}
            >
              Reset to default
            </Button>
          </CardContent>
        </Card>

        <CoachMemoryCard />

        <div className="flex items-center gap-3">
          <Button onClick={save}>
            <Save className="size-4" />
            Save settings
          </Button>
          <span className="text-sm text-muted-foreground">
            {saved ? (
              <span className="text-green-600">Saved ✓</span>
            ) : (
              "Changes are saved automatically."
            )}
          </span>
        </div>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-red-500" />
              Data &amp; privacy
            </CardTitle>
            <CardDescription>
              Everything lives on this device. Clear it out — for example, before
              handing the app to someone else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Clear coach memory</div>
                <div className="text-muted-foreground">
                  Forget the facts the assistant has learned about you.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm("memory")}
              >
                <Trash2 className="size-4" />
                Clear memory
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="text-sm">
                <div className="font-medium">Erase all data</div>
                <div className="text-muted-foreground">
                  Delete all tasks, projects, seminars, writing, chats, memory,
                  and settings — a clean slate for a new person.
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setConfirm("all")}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                <Trash2 className="size-4" />
                Erase everything
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)}>
        <h2 className="mb-2 text-lg font-semibold">
          {confirm === "all" ? "Erase all data?" : "Clear coach memory?"}
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          {confirm === "all"
            ? "This permanently deletes everything in the app on this device — tasks, projects, seminars, documents, chats, learned memory, and settings. This can't be undone."
            : "This permanently forgets everything the assistant has learned about you. Your tasks, projects, and writing are kept. This can't be undone."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={runConfirm}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <Trash2 className="size-4" />
            {confirm === "all" ? "Erase everything" : "Clear memory"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
