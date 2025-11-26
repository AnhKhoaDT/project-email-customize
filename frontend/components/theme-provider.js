"use client";

import { useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

const ThemeProviders = ({ children, attribute, defaultTheme, enableSystem }) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    return (
        <NextThemesProvider attribute={attribute} defaultTheme={defaultTheme} enableSystem={enableSystem}>
            {children}
        </NextThemesProvider>
    );
}

export default ThemeProviders;