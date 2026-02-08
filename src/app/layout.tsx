import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BB Trainer",
  description: "Upload Blood Bowl 3 replay XML and get constructive coaching feedback."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
