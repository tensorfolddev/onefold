import type { Metadata } from "next";
import { Figtree, Poppins } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/data/StoreProvider";
import { TooltipLayer } from "@/ui/TooltipLayer";
import { THEME_SCRIPT } from "@/features/shell/themes";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "1Fold",
  description: "Product and ticket management for software teams — every product, from intake to release, in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${poppins.variable}`}>
      {/* The saved theme is applied before the first paint, so React finds the body already themed. */}
      <body className="light-app-theme" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <StoreProvider>{children}</StoreProvider>
        <TooltipLayer />
      </body>
    </html>
  );
}
