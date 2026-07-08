import { Mail, Globe } from "lucide-react";
import type { MediaKit } from "@/lib/mediakit";

export default function MediaKitPreview({ kit }: { kit: MediaKit }) {
  const hasBook =
    kit.bookTitle || kit.bookCoverUrl || kit.bookDescription || kit.bookSubtitle;

  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <header className="flex items-center gap-6 border-b border-border pb-6">
        {kit.photoUrl && (
          <img
            src={kit.photoUrl}
            alt={kit.authorName}
            className="size-24 shrink-0 rounded-full object-cover"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {kit.authorName || "Your name"}
          </h1>
          {kit.title && (
            <p className="text-muted-foreground">{kit.title}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {kit.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-4" />
                {kit.email}
              </span>
            )}
            {kit.website && (
              <span className="flex items-center gap-1.5">
                <Globe className="size-4" />
                {kit.website}
              </span>
            )}
          </div>
        </div>
      </header>

      {kit.bio && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            About
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {kit.bio}
          </p>
        </section>
      )}

      {hasBook && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            The book
          </h2>
          <div className="flex gap-5">
            {kit.bookCoverUrl && (
              <img
                src={kit.bookCoverUrl}
                alt={kit.bookTitle}
                className="h-40 w-28 shrink-0 rounded-md object-cover shadow-sm"
              />
            )}
            <div className="min-w-0">
              {kit.bookTitle && (
                <h3 className="text-lg font-semibold">{kit.bookTitle}</h3>
              )}
              {kit.bookSubtitle && (
                <p className="italic text-muted-foreground">
                  {kit.bookSubtitle}
                </p>
              )}
              {kit.bookDescription && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {kit.bookDescription}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {kit.testimonials.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Praise
          </h2>
          <div className="space-y-4">
            {kit.testimonials
              .filter((t) => t.quote.trim())
              .map((t) => (
                <blockquote
                  key={t.id}
                  className="border-l-2 border-primary pl-4"
                >
                  <p className="text-sm italic leading-relaxed">"{t.quote}"</p>
                  {t.author && (
                    <footer className="mt-1 text-xs text-muted-foreground">
                      — {t.author}
                    </footer>
                  )}
                </blockquote>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
