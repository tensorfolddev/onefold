/** Any project doc: built on its first visit, then served static — so a link to it prefetches in full and opens at once. */
export const generateStaticParams = () => [];

export default function ProjectDocLayout({ children }: { children: React.ReactNode }) {
  return children;
}
