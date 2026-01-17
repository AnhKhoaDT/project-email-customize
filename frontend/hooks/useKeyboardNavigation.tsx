"use client";

import { useEffect, useCallback, useState } from 'react';

interface KeyboardNavigationOptions {
    onNextEmail?: () => void;
    onPreviousEmail?: () => void;
    onOpenEmail?: () => void;
    onCloseEmail?: () => void;
    onArchive?: () => void;
    onStar?: () => void;
    onDelete?: () => void;
    onReply?: () => void;
    onCompose?: () => void;
    onForward?: () => void;
    onSearch?: () => void;
    onMoveRight?: () => void;
    onMoveLeft?: () => void;
    onSelectToggle?: () => void;
    onMarkRead?: () => void;
    onMarkUnread?: () => void;
    onNextColumn?: () => void;
    onPreviousColumn?: () => void;
    onJumpToColumn?: (columnIndex: number) => void;
    onOpenInGmail?: () => void;
    isEmailOpen?: boolean;
    isComposing?: boolean;
    disabled?: boolean;
}

export const useKeyboardNavigation = (options: KeyboardNavigationOptions) => {
    const [showShortcuts, setShowShortcuts] = useState(false);



    const handleKeyPress = useCallback((e: globalThis.KeyboardEvent) => {
        // If the shortcuts modal is open, block all keys except Escape or Shift+? which close/toggle it
        if (showShortcuts) {
            // Allow close with Escape
            if (e.key === 'Escape') {
                setShowShortcuts(false);
                return;
            }

            // Allow toggle/close with Shift+?
            if (e.key === '?' && e.shiftKey) {
                setShowShortcuts(prev => !prev);
                return;
            }

            // Block everything else while modal is open
            try { e.stopImmediatePropagation(); } catch { }
            if (!e.ctrlKey && !e.metaKey) e.preventDefault();
            return;
        }

        // Don't trigger if user is typing in input/textarea
        const target = e.target as HTMLElement;
        if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            options.disabled
        ) {
            return;
        }

        // Prevent default for our shortcuts
        const shouldPreventDefault = [
            'j', 'k', 'x', 'e', 's', 'r', 'c', 'a', 'f', 'v', 'l', 'z', 'n', 'p', 'g',
            'ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', '/', '?'
        ].includes(e.key);

        if (shouldPreventDefault && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }

        // Navigation shortcuts
        switch (e.key.toLowerCase()) {
            // Basic Navigation
            case 'j':
            case 'arrowdown':
                options.onNextEmail?.();
                break;

            case 'k':
            case 'arrowup':
                options.onPreviousEmail?.();
                break;

            case 'enter':
                options.onOpenEmail?.();
                break;

            case 'escape':
                if (showShortcuts) {
                    setShowShortcuts(false);
                } else {
                    options.onCloseEmail?.();
                }
                break;

            // Actions
            case 'e':
            case 'y':
                if (!options.isComposing) {
                    options.onArchive?.();
                }
                break;

            case 's':
                if (!options.isComposing) {
                    options.onStar?.();
                }
                break;

            case 'g':
                if (options.isEmailOpen && !options.isComposing) {
                    options.onOpenInGmail?.();
                }
                break;

            case 'delete':
            case '#':
                if (!options.isComposing) {
                    options.onDelete?.();
                }
                break;

            case 'x':
                if (!options.isComposing) {
                    options.onSelectToggle?.();
                }
                break;

            // Compose & Reply
            case 'c':
                if (!options.isComposing) {
                    options.onCompose?.();
                }
                break;

            case 'r':
                if (options.isEmailOpen && !options.isComposing) {
                    options.onReply?.();
                }
                break;

            // Forward
            case 'f':
                if (options.isEmailOpen && !options.isComposing) {
                    options.onForward?.();
                }
                break;

            // Open in Gmail
            case 'g':
                if (!options.isComposing) {
                    options.onOpenInGmail?.();
                }
                break;

            // Search
            case '/':
                options.onSearch?.();
                break;

            // Help
            case '?':
                if (e.shiftKey) {
                    setShowShortcuts(prev => !prev);
                }
                break;

            // Column Navigation
            case 'tab':
                if (e.shiftKey) {
                    options.onPreviousColumn?.();
                } else {
                    options.onNextColumn?.();
                }
                break;

            // Kanban-specific
            case 'arrowright':
                if (e.shiftKey) {
                    options.onMoveRight?.();
                }
                break;

            case 'arrowleft':
                if (e.shiftKey) {
                    options.onMoveLeft?.();
                }
                break;

            // Mark as read/unread
            case 'i':
                if (e.shiftKey) {
                    options.onMarkRead?.();
                }
                break;

            case 'u':
                if (e.shiftKey) {
                    options.onMarkUnread?.();
                }
                break;

            // Jump to columns (1-9)
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                const columnIndex = parseInt(e.key) - 1;
                options.onJumpToColumn?.(columnIndex);
                break;
        }

        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'enter':
                    // Send email when composing
                    if (options.isComposing) {
                        // Handled by compose component
                    }
                    break;

                case 'k':
                    // Quick actions / Command palette
                    e.preventDefault();
                    // Open command palette (implement separately)
                    break;
            }
        }
    }, [options, showShortcuts]);

    useEffect(() => {
        // Ensure listener has correct DOM event signature
        const listener = (handleKeyPress as unknown) as EventListener;
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [handleKeyPress]);

    return {
        showShortcuts,
        setShowShortcuts,
    };
};

// Keyboard Shortcuts Modal Component
export const KeyboardShortcutsModal = ({
    isOpen,
    onClose
}: {
    isOpen: boolean;
    onClose: () => void
}) => {
    if (!isOpen) return null;

    const shortcuts = [
        {
            category: 'Navigation',
            items: [
                { keys: ['j', '↓'], description: 'Next email' },
                { keys: ['k', '↑'], description: 'Previous email' },
                { keys: ['Enter'], description: 'Open email' },
                { keys: ['Esc'], description: 'Close email' },
                { keys: ['Tab'], description: 'Next column' },
                { keys: ['Shift', 'Tab'], description: 'Previous column' },
            ],
        },
        {
            category: 'Actions',
            items: [
                { keys: ['e'], description: 'Archive' },
                { keys: ['s'], description: 'Star' },
                { keys: ['g'], description: 'Open in Gmail' },
                { keys: ['#'], description: 'Delete' },
                { keys: ['Shift', 'i'], description: 'Mark as read' },
                { keys: ['Shift', 'u'], description: 'Mark as unread' },
            ],
        },
        {
            category: 'Compose',
            items: [
                { keys: ['c'], description: 'Compose new email' },
                { keys: ['r'], description: 'Reply' },
                { keys: ['f'], description: 'Forward email' },
                { keys: ['Ctrl', 'Enter'], description: 'Send email' },
                { keys: ['Alt', 'c'], description: 'cc' },
                { keys: ['Alt', 'b'], description: 'bcc' },
            ],
        },
        {
            category: 'Kanban',
            items: [
                { keys: ['Shift', '→'], description: 'Move to next column' },
                { keys: ['Shift', '←'], description: 'Move to previous column' },
                { keys: ['1-9'], description: 'Jump to column' },
            ],
        },
        {
            category: 'Other',
            items: [
                { keys: ['/'], description: 'Search' },
                { keys: ['?'], description: 'Show shortcuts' },
            ],
        },
    ];

    return (
        <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Keyboard Shortcuts
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Quick actions to navigate efficiently
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-primary cursor-pointer"
                        aria-label="Close"
                    >
                        <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[60vh] overflow-y-auto p-6">
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {shortcuts.map((section) => (
                            <div key={section.category} className="space-y-4">
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {section.category}
                                    </h3>
                                    <div className="space-y-3">
                                        {section.items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                            >
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {item.description}
                                                </span>
                                                <div className="flex gap-1.5">
                                                    {item.keys.map((key, keyIdx) => (
                                                        <kbd
                                                            key={keyIdx}
                                                            className="flex items-center justify-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-300"
                                                        >
                                                            {key}
                                                        </kbd>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer Note */}
                    <div className="mt-8 rounded-lg bg-blue-50/50 p-4 dark:bg-blue-900/20">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800">
                                <svg
                                    className="h-3 w-3 text-blue-600 dark:text-blue-300"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    These shortcuts work globally when you're not typing in a text
                                    field. Press{" "}
                                    <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                                        Esc
                                    </kbd>{" "}
                                    to close this modal.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-900/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Available in all views
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
