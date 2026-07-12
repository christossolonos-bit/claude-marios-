import { useEffect, useRef, useState } from "react";
import { type SlideElement, SLIDE_REF_W } from "@/lib/decks";
import { cn } from "@/lib/utils";

const pxToCqw = (px: number) => (px / SLIDE_REF_W) * 100;
const MIN = 4; // minimum element width/height in % of slide
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Corner = "nw" | "ne" | "sw" | "se";

interface DragState {
  id: string;
  mode: "move" | "resize";
  corner?: Corner;
  startX: number; // mouse px
  startY: number;
  orig: { x: number; y: number; w: number; h: number };
}

interface Props {
  elements: SlideElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (elements: SlideElement[]) => void;
}

// The editable, PowerPoint-style slide surface: elements can be dragged to move,
// dragged by their corners to resize, and text can be edited in place by
// double-clicking. Positions/sizes are percentages so everything stays put at
// any rendered size. Font size scales via container units, matching SlideView.
export default function SlideCanvas({
  elements,
  selectedId,
  onSelect,
  onChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function patch(id: string, p: Partial<SlideElement>) {
    onChange(elements.map((el) => (el.id === id ? { ...el, ...p } : el)));
  }

  // Global mouse handlers for drag/resize — attached once, reading dragRef so
  // there are no stale closures.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!d || !rect) return;
      const dx = ((e.clientX - d.startX) / rect.width) * 100;
      const dy = ((e.clientY - d.startY) / rect.height) * 100;
      const o = d.orig;
      if (d.mode === "move") {
        patch(d.id, {
          x: clamp(o.x + dx, 0, 100 - o.w),
          y: clamp(o.y + dy, 0, 100 - o.h),
        });
        return;
      }
      let { x, y, w, h } = o;
      const c = d.corner!;
      if (c === "se") {
        w = clamp(o.w + dx, MIN, 100 - o.x);
        h = clamp(o.h + dy, MIN, 100 - o.y);
      } else if (c === "sw") {
        w = clamp(o.w - dx, MIN, o.x + o.w);
        x = o.x + o.w - w;
        h = clamp(o.h + dy, MIN, 100 - o.y);
      } else if (c === "ne") {
        w = clamp(o.w + dx, MIN, 100 - o.x);
        h = clamp(o.h - dy, MIN, o.y + o.h);
        y = o.y + o.h - h;
      } else {
        // nw
        w = clamp(o.w - dx, MIN, o.x + o.w);
        x = o.x + o.w - w;
        h = clamp(o.h - dy, MIN, o.y + o.h);
        y = o.y + o.h - h;
      }
      patch(d.id, { x, y, w, h });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  function startMove(e: React.MouseEvent, el: SlideElement) {
    if (editingId === el.id) return;
    e.preventDefault();
    onSelect(el.id);
    dragRef.current = {
      id: el.id,
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
    };
  }

  function startResize(e: React.MouseEvent, el: SlideElement, corner: Corner) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(el.id);
    dragRef.current = {
      id: el.id,
      mode: "resize",
      corner,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
    };
  }

  const corners: Corner[] = ["nw", "ne", "sw", "se"];
  const cornerPos: Record<Corner, string> = {
    nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  };

  return (
    <div
      ref={canvasRef}
      onMouseDown={() => onSelect(null)}
      className="relative h-full w-full overflow-hidden bg-white text-neutral-900 select-none"
      style={{ containerType: "size" }}
    >
      {elements.map((el) => {
        const selected = el.id === selectedId;
        const editing = el.id === editingId;
        const box: React.CSSProperties = {
          position: "absolute",
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.w}%`,
          height: `${el.h}%`,
        };
        const textStyle: React.CSSProperties = {
          fontSize: `${pxToCqw(el.fontSize ?? 24)}cqw`,
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? "italic" : "normal",
          textAlign: el.align ?? "left",
          color: el.color ?? "#171717",
          lineHeight: 1.25,
        };
        return (
          <div
            key={el.id}
            style={box}
            onMouseDown={(e) => {
              e.stopPropagation();
              startMove(e, el);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (el.type === "text") setEditingId(el.id);
            }}
            className={cn(
              "group",
              editing ? "cursor-text" : "cursor-move",
              selected ? "outline outline-2 outline-primary" : "outline outline-1 outline-transparent hover:outline-primary/40",
            )}
          >
            {el.type === "image" ? (
              el.src ? (
                <img
                  src={el.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                  image
                </div>
              )
            ) : editing ? (
              <textarea
                autoFocus
                value={el.text ?? ""}
                onChange={(e) => patch(el.id, { text: e.target.value })}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingId(null);
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={textStyle}
                className="h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 outline-none"
              />
            ) : (
              <div
                style={textStyle}
                className="pointer-events-none h-full w-full overflow-hidden whitespace-pre-wrap break-words"
              >
                {el.text}
              </div>
            )}

            {selected && !editing && (
              <>
                {corners.map((c) => (
                  <div
                    key={c}
                    onMouseDown={(e) => startResize(e, el, c)}
                    className={cn(
                      "absolute z-10 size-2.5 rounded-full border border-white bg-primary",
                      cornerPos[c],
                    )}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
