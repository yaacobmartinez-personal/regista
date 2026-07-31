import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Regista — Event registration for every organization",
  description:
    "Multitenant event registration. Publish events, collect registrations, manage attendees.",
};

// Set the theme before paint to avoid a flash of the wrong theme.
const noFlashTheme = `try{var t=localStorage.getItem('regista-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-fg font-sans">
        {/* Applies the stored theme before paint, so there's no flash of the
            wrong one. `beforeInteractive` is the supported way to do this —
            a bare <script> element is rendered by React, which warns that it
            won't execute on client navigations. */}
        <Script id="regista-theme" strategy="beforeInteractive">
          {noFlashTheme}
        </Script>
        {children}
      </body>
    </html>
  );
}
