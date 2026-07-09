import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";
import {
  type Settings as AppSettings,
  getSettings,
  saveSettings,
  DEFAULT_PERSONA,
} from "@/lib/settings";
import { getModels } from "@/lib/ollama";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getModels()
      .then(setModels)
      .catch(() => setModelsError(true));
  }, []);

  function update(patch: Partial<AppSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  }

  function save() {
    saveSettings(settings);
    setSaved(true);
  }

  const modelOptions = models.length ? models : [settings.model];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <SettingsIcon className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Configure your local AI assistant. Everything stays on your machine.
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Assistant model</CardTitle>
            <CardDescription>
              {modelsError
                ? "Couldn't reach Ollama — is it running?"
                : "Runs locally via Ollama, auto-detected from your installed models."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              className={selectClass}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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
          {saved && <span className="text-sm text-green-600">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
