import type { Metadata } from "next";
import { Figtree, Poppins } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/data/StoreProvider";
import { TooltipLayer } from "@/ui/TooltipLayer";

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
      <body className="light-app-theme">
        <StoreProvider>{children}</StoreProvider>
        <TooltipLayer />
      </body>
    </html>
  );
}
