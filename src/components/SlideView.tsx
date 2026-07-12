import { type Slide, SLIDE_REF_W, elementsForSlide } from "@/lib/decks";

// Read-only render of a slide's free-canvas elements. Used for thumbnails and
// present mode. Positions/sizes are percentages; font size scales with the
// slide via container query units (cqw), so one component looks right at any
// size with no JS measuring. The root is a light "paper" surface like a real
// slide, regardless of app theme.
//
// 1 cqw = 1% of this container's width, so a font authored at `fontSize` px on
// a SLIDE_REF_W-wide slide renders as `fontSize / SLIDE_REF_W * 100` cqw.
const pxToCqw = (px: number) => (px / SLIDE_REF_W) * 100;

export default function SlideView({ slide }: { slide: Slide }) {
  const elements = elementsForSlide(slide);
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-white text-neutral-900"
      style={{ containerType: "size" }}
    >
      {elements.map((el) => {
        const style: React.CSSProperties = {
          position: "absolute",
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.w}%`,
          height: `${el.h}%`,
        };
        if (el.type === "image") {
          return (
            <div key={el.id} style={style} className="flex items-center justify-center">
              {el.src && (
                <img
                  src={el.src}
                  alt=""
                  className="h-full w-full object-contain"
                />
              )}
            </div>
          );
        }
        return (
          <div
            key={el.id}
            style={{
              ...style,
              fontSize: `${pxToCqw(el.fontSize ?? 24)}cqw`,
              fontWeight: el.bold ? 700 : 400,
              fontStyle: el.italic ? "italic" : "normal",
              textAlign: el.align ?? "left",
              color: el.color ?? "#171717",
              lineHeight: 1.25,
            }}
            className="overflow-hidden whitespace-pre-wrap break-words"
          >
            {el.text}
          </div>
        );
      })}
    </div>
  );
}
