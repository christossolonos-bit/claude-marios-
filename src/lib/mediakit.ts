// Media kit — a single record (author + book + testimonials), stored locally.

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
}

export interface MediaKit {
  authorName: string;
  title: string; // e.g. "Life Coach & Author"
  bio: string;
  photoUrl: string;
  email: string;
  website: string;
  bookTitle: string;
  bookSubtitle: string;
  bookCoverUrl: string;
  bookDescription: string;
  testimonials: Testimonial[];
}

const KEY = "authorhub.mediakit.v1";

const DEFAULT: MediaKit = {
  authorName: "",
  title: "",
  bio: "",
  photoUrl: "",
  email: "",
  website: "",
  bookTitle: "",
  bookSubtitle: "",
  bookCoverUrl: "",
  bookDescription: "",
  testimonials: [],
};

export function getMediaKit(): MediaKit {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<MediaKit>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function saveMediaKit(kit: MediaKit): void {
  localStorage.setItem(KEY, JSON.stringify(kit));
}

export function isEmpty(kit: MediaKit): boolean {
  return (
    !kit.authorName &&
    !kit.bio &&
    !kit.bookTitle &&
    !kit.bookDescription &&
    kit.testimonials.length === 0
  );
}
