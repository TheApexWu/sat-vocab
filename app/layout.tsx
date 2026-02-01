import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Vocab — SAT Word Practice",
  description: "Learn 3-5 SAT vocabulary words daily with connotation, etymology, and sentence practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
