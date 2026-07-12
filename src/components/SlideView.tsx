import { type Slide, elementsForSlide } from "@/lib/decks";
import { textCss, ShapeView } from "@/components/slideParts";

// Read-only render of a slide's free-canvas elements. Used for thumbnails and
// present mode. Positions/sizes are percentages; font/shape sizes scale with
// the slide via container query units, so one component looks right at any size
// with no JS measuring. The root is a light "paper" surface like a real slide,
// regardless of app theme.
export default function SlideView({ slide }: { slide: Slide }) {
  const elements = elementsForSlide(slide);
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-white text-neutral-900"
      style={{ containerType: "size" }}
    >
      {elements.map((el) => {
        const box: React.CSSProperties = {
          position: "absolute",
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.w}%`,
          height: `${el.h}%`,
        };
        if (el.type === "image") {
          return (
            <div key={el.id} style={box} className="flex items-center justify-center">
              {el.src && (
                <img src={el.src} alt="" className="h-full w-full object-contain" />
              )}
            </div>
          );
        }
        if (el.type === "shape") {
          return (
            <div key={el.id} style={box}>
              <ShapeView el={el} />
            </div>
          );
        }
        return (
          <div
            key={el.id}
            style={{ ...box, ...textCss(el) }}
            className="overflow-hidden whitespace-pre-wrap break-words"
          >
            {el.text}
          </div>
        );
      })}
    </div>
  );
}
