import { useEffect, useState } from "react";
import { Brain, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import {
  type Memory,
  listMemories,
  addMemory,
  editMemory,
  deleteMemory,
} from "@/lib/coachMemory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function CoachMemoryCard() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function refresh() {
    setMemories(await listMemories());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    await addMemory(text);
    setDraft("");
    refresh();
  }

  async function saveEdit() {
    if (editingId) {
      await editMemory(editingId, editText);
      setEditingId(null);
      setEditText("");
      refresh();
    }
  }

  async function remove(id: string) {
    await deleteMemory(id);
    refresh();
  }

  function startEdit(m: Memory) {
    setEditingId(m.id);
    setEditText(m.text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          Coach memory
        </CardTitle>
        <CardDescription>
          Durable facts your assistant has learned about you. It reads these on
          every chat to stay personal. You can edit or delete anything here —
          it all stays on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {memories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. The assistant will save facts as you chat, or you can
            add one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {editingId === m.id ? (
                  <>
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-8 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={saveEdit}
                      title="Save"
                    >
                      <Check className="size-4 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditingId(null)}
                      title="Cancel"
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">{m.text}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      onClick={() => startEdit(m)}
                      title="Edit"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-red-600"
                      onClick={() => remove(m.id)}
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add something the assistant should remember…"
            className="flex-1"
          />
          <Button onClick={add} disabled={!draft.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
