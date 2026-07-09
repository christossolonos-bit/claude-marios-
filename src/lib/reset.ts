// Data reset helpers — clear what the assistant has learned, or wipe everything
// so the app can be handed to someone else with none of the previous person's
// information, projects, or writing. All local; only touches this app's keys.

/** Remove only the durable facts the assistant has learned about the user. */
export function clearCoachMemory(): void {
  localStorage.removeItem("authorhub.coachmemory.v1");
}

/**
 * Erase all of this app's data: tasks, projects, seminars, documents, chats,
 * coach memory, sales, marketing, media kit, writing stats, and settings.
 * Settings fall back to defaults on next load.
 */
export function eraseAllData(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("authorhub.")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));

  // Session-scoped caches (greeting/briefing).
  const skeys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith("authorhub.")) skeys.push(k);
  }
  skeys.forEach((k) => sessionStorage.removeItem(k));
}
