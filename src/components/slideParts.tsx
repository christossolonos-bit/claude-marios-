import { type SlideElement, SLIDE_REF_W } from "@/lib/decks";

// 1 cqw = 1% of the slide container's width, so a font authored at `px` on a
// SLIDE_REF_W-wide slide renders as `px / SLIDE_REF_W * 100` cqw and scales with
// the slide. Shared by the editor canvas, thumbnails, and present mode so all
// three always match.
export const pxToCqw = (px: number) => (px / SLIDE_REF_W) * 100;

export function textCss(el: SlideElement): React.CSSProperties {
  return {
    fontSize: `${pxToCqw(el.fontSize ?? 24)}cqw`,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textAlign: el.align ?? "left",
    color: el.color ?? "#171717",
    fontFamily: el.fontFamily || undefined,
    background: el.bg && el.bg !== "transparent" ? el.bg : undefined,
    lineHeight: 1.25,
  };
}

// Read-only render of a shape element (rect / ellipse / line). Scales with the
// slide via cqw so it looks the same at thumbnail and present size.
export function ShapeView({ el }: { el: SlideElement }) {
  if (el.shape === "line") {
    return (
      <div className="pointer-events-none flex h-full w-full items-center">
        <div
          style={{
            width: "100%",
            height: `${pxToCqw(el.strokeWidth ?? 4)}cqw`,
            background: el.stroke ?? "#171717",
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none h-full w-full"
      style={{
        background: el.fill ?? "#dbeafe",
        border: el.strokeWidth
          ? `${pxToCqw(el.strokeWidth)}cqw solid ${el.stroke ?? "#3b82f6"}`
          : "none",
        borderRadius: el.shape === "ellipse" ? "50%" : "0.4cqw",
      }}
    />
  );
}
