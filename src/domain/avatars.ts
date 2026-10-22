// A person's photo: one they uploaded ("file:<id>" — set only by the server's upload, so it's always their own image),
// or one of these ready-made ones ("tpl:<id>"); none = their initials on their colour.
export interface AvatarTemplate { id: string; emoji: string; bg: string }

export const AVATAR_TEMPLATES: readonly AvatarTemplate[] = [
  { id: "fox", emoji: "🦊", bg: "linear-gradient(135deg, #ffd8b5, #ff9f6b)" },
  { id: "panda", emoji: "🐼", bg: "linear-gradient(135deg, #e7f0e3, #a9d6a4)" },
  { id: "lion", emoji: "🦁", bg: "linear-gradient(135deg, #fff1b8, #ffc94d)" },
  { id: "koala", emoji: "🐨", bg: "linear-gradient(135deg, #e3e8f2, #a9b6d3)" },
  { id: "owl", emoji: "🦉", bg: "linear-gradient(135deg, #efe2d4, #c9a27e)" },
  { id: "octopus", emoji: "🐙", bg: "linear-gradient(135deg, #ffd6e7, #ff8fb6)" },
  { id: "penguin", emoji: "🐧", bg: "linear-gradient(135deg, #d9efff, #8cc8ff)" },
  { id: "cat", emoji: "🐱", bg: "linear-gradient(135deg, #fde7cf, #f6b97b)" },
  { id: "rocket", emoji: "🚀", bg: "linear-gradient(135deg, #e2dcff, #9f8cff)" },
  { id: "cactus", emoji: "🌵", bg: "linear-gradient(135deg, #e0f7ea, #7fd6a3)" },
  { id: "sunflower", emoji: "🌻", bg: "linear-gradient(135deg, #fff4cc, #ffd34d)" },
  { id: "planet", emoji: "🪐", bg: "linear-gradient(135deg, #dff3ff, #74c2f0)" },
];

export const templateOf = (photo?: string) => (photo?.startsWith("tpl:") ? AVATAR_TEMPLATES.find((t) => t.id === photo.slice(4)) : undefined);
/** The uploaded image's file id, if the photo is one. */
export const photoFileOf = (photo?: string) => (photo?.startsWith("file:") ? photo.slice(5) : undefined);
