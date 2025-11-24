import ThemeSwitcher from "@/components/theme-switcher";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex relative w-full min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-900">
      {children}

      {/* ThemeSwitcher component to toggle light/dark themes */}
      <div className="absolute bottom-0 right-0 m-4">
        <ThemeSwitcher />
      </div>
    </div>
  );
}
