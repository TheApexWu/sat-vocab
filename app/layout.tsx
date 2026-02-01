import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAT Vocab — Daily Words",
  description: "Learn 3-5 SAT vocabulary words daily with connotation, etymology, and sentence practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
