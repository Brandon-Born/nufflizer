import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nufflizier",
  description: "Upload Blood Bowl 3 replay files and analyze who got blessed by Nuffle.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
