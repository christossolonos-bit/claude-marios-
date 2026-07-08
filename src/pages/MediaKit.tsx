import { useState } from "react";
import {
  BookOpen,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Printer,
  Pencil,
  Eye,
  Upload,
  AlertCircle,
} from "lucide-react";
import {
  type MediaKit,
  type Testimonial,
  getMediaKit,
  saveMediaKit,
} from "@/lib/mediakit";
import { streamChat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import MediaKitPreview from "@/components/MediaKitPreview";

type ImageField = "photoUrl" | "bookCoverUrl";

function ImagePicker({
  label,
  value,
  round,
  onChange,
}: {
  label: string;
  value: string;
  round?: boolean;
  onChange: (dataUrlOrUrl: string) => void;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) {
      alert("Image is too large (max ~2MB). Try a smaller one or paste a URL.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(f);
    e.target.value = "";
  }

  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        {value && (
          <img
            src={value}
            alt=""
            className={
              round
                ? "size-12 shrink-0 rounded-full object-cover"
                : "h-16 w-11 shrink-0 rounded object-cover"
            }
          />
        )}
        <Input
          value={value.startsWith("data:") ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={value.startsWith("data:") ? "Uploaded image" : "Paste image URL"}
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
          <Upload className="size-4" />
          Upload
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}

export default function MediaKitPage() {
  const [kit, setKit] = useState<MediaKit>(() => getMediaKit());
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [polishing, setPolishing] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  function set(patch: Partial<MediaKit>) {
    setKit((prev) => {
      const next = { ...prev, ...patch };
      saveMediaKit(next);
      return next;
    });
  }

  function setImage(field: ImageField, val: string) {
    set({ [field]: val } as Partial<MediaKit>);
  }

  function addTestimonial() {
    set({
      testimonials: [
        ...kit.testimonials,
        { id: crypto.randomUUID(), quote: "", author: "" },
      ],
    });
  }

  function setTestimonial(id: string, patch: Partial<Testimonial>) {
    set({
      testimonials: kit.testimonials.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    });
  }

  function removeTestimonial(id: string) {
    set({ testimonials: kit.testimonials.filter((t) => t.id !== id) });
  }

  async function polishBio() {
    setBioError(null);
    setPolishing(true);
    const system = "You are an expert author-bio copywriter for press kits.";
    const user = `Rewrite the following into a polished, compelling third-person author bio of about 100-150 words for a press kit. Stay factual to what is provided; do not invent credentials or achievements. Write plain prose only — no markdown, asterisks, or headings.\n\nName: ${kit.authorName || "(not given)"}\nTitle/role: ${kit.title || "(not given)"}\nCurrent bio or notes:\n${kit.bio || "(none)"}`;
    let acc = "";
    try {
      await streamChat({
        model: getSettings().model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        onToken: (t) => {
          acc += t;
          set({ bio: acc });
        },
      });
    } catch (e) {
      setBioError((e as Error).message || String(e));
    } finally {
      setPolishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <BookOpen className="size-7 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Media Kit</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <button
              onClick={() => setMode("edit")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                mode === "edit" ? "bg-secondary" : "text-muted-foreground"
              }`}
            >
              <Pencil className="size-4" />
              Edit
            </button>
            <button
              onClick={() => setMode("preview")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                mode === "preview" ? "bg-secondary" : "text-muted-foreground"
              }`}
            >
              <Eye className="size-4" />
              Preview
            </button>
          </div>
          {mode === "preview" && (
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              Print / PDF
            </Button>
          )}
        </div>
      </div>

      {mode === "preview" ? (
        <MediaKitPreview kit={kit} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Author</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={kit.authorName}
                    onChange={(e) => set({ authorName: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Title / role</label>
                  <Input
                    value={kit.title}
                    onChange={(e) => set({ title: e.target.value })}
                    className="mt-1"
                    placeholder="Life Coach & Author"
                  />
                </div>
              </div>

              <ImagePicker
                label="Headshot"
                value={kit.photoUrl}
                round
                onChange={(v) => setImage("photoUrl", v)}
              />

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium">Bio</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={polishBio}
                    disabled={polishing}
                  >
                    {polishing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {polishing ? "Polishing…" : "Polish with AI"}
                  </Button>
                </div>
                <Textarea
                  value={kit.bio}
                  onChange={(e) => set({ bio: e.target.value })}
                  rows={5}
                  placeholder="A short professional bio, or rough notes for the AI to polish."
                />
                {bioError && (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle className="size-4 shrink-0" />
                    {bioError}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    value={kit.email}
                    onChange={(e) => set({ email: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Website</label>
                  <Input
                    value={kit.website}
                    onChange={(e) => set({ website: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>The book</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={kit.bookTitle}
                    onChange={(e) => set({ bookTitle: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Subtitle</label>
                  <Input
                    value={kit.bookSubtitle}
                    onChange={(e) => set({ bookSubtitle: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <ImagePicker
                label="Cover"
                value={kit.bookCoverUrl}
                onChange={(v) => setImage("bookCoverUrl", v)}
              />
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={kit.bookDescription}
                  onChange={(e) => set({ bookDescription: e.target.value })}
                  rows={4}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Testimonials</CardTitle>
              <Button variant="outline" size="sm" onClick={addTestimonial}>
                <Plus className="size-4" />
                Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {kit.testimonials.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Add quotes from readers, clients, or reviewers.
                </p>
              )}
              {kit.testimonials.map((t) => (
                <div key={t.id} className="flex gap-2">
                  <div className="flex-1 space-y-2">
                    <Textarea
                      value={t.quote}
                      onChange={(e) =>
                        setTestimonial(t.id, { quote: e.target.value })
                      }
                      rows={2}
                      placeholder="Quote"
                    />
                    <Input
                      value={t.author}
                      onChange={(e) =>
                        setTestimonial(t.id, { author: e.target.value })
                      }
                      placeholder="Attribution (name, title)"
                    />
                  </div>
                  <button
                    onClick={() => removeTestimonial(t.id)}
                    aria-label="Remove"
                    className="self-start rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Changes save automatically. Switch to Preview to print or save as PDF.
          </p>
        </div>
      )}
    </div>
  );
}
