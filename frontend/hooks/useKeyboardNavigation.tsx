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
    onToggleRead?: () => void;
    onNextColumn?: () => void;
    onPreviousColumn?: () => void;
    onJumpToColumn?: (columnIndex: number) => void;
    onOpenInGmail?: () => void;
    onClearSearch?: () => void;
    isEmailOpen?: boolean;
    isComposing?: boolean;
    isForwarding?: boolean;
    disabled?: boolean;
    isKanbanMode?: boolean;
}

export const useKeyboardNavigation = (options: KeyboardNavigationOptions) => {
    const [showShortcuts, setShowShortcuts] = useState(false);

    const handleKeyPress = useCallback((e: globalThis.KeyboardEvent) => {
        // Nếu modal phím tắt đang mở
        if (showShortcuts) {
            if (e.key === 'Escape') {
                setShowShortcuts(false);
                return;
            }
            if (e.key === '?' && e.shiftKey) {
                setShowShortcuts(prev => !prev);
                return;
            }
            // Chặn tất cả các phím khác khi modal đang mở
            try { e.stopImmediatePropagation(); } catch { }
            if (!e.ctrlKey && !e.metaKey) e.preventDefault();
            return;
        }

        // Allow Ctrl+/ to clear search even when an input is focused
        const target = e.target as HTMLElement;
        const isCtrlSlash = (e.ctrlKey || e.metaKey) && e.key === '/';
        if (isCtrlSlash) {
            options.onClearSearch?.();
            e.preventDefault();
            return;
        }

        // Always allow Shift+? to open the shortcuts modal, even when typing in inputs
        if (e.shiftKey && e.key === '?') {
            setShowShortcuts(prev => !prev);
            e.preventDefault();
            return;
        }

        // If the search input is focused, allow Escape to unfocus (blur) it
        const isSearchInput = target instanceof HTMLElement && target.classList.contains?.('mailbox-search-input');
        if (isSearchInput && e.key === 'Escape') {
            try {
                (target as HTMLInputElement).blur();
            } catch (err) {
                // ignore
            }
            e.preventDefault();
            return;
        }

        // Don't handle other shortcuts when typing in input/textarea/contentEditable
        // Exception: when an email detail is open, allow shortcuts to work even if focus is inside the modal
        const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if ((isTextInput && !options.isEmailOpen) || options.disabled) {
            return;
        }

        // Ngăn hành động mặc định cho các phím tắt
        const preventDefaultKeys = [
            'j', 'k', 'x', 'e', 'y', 's', 'r', 'c', 'f', 'g', 'd', '#', 'v', 'l', 'z', 'n', 'p',
            'ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', '/', '?', 'm'
        ];

        if (preventDefaultKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }

        // Xử lý phím tắt trong chế độ Kanban
        if (options.isKanbanMode) {
            if (e.key === 'ArrowRight' && !e.shiftKey) {
                options.onNextColumn?.();
                return;
            }
            if (e.key === 'ArrowLeft' && !e.shiftKey) {
                options.onPreviousColumn?.();
                return;
            }
            if (e.key === 'ArrowRight' && e.shiftKey) {
                options.onMoveRight?.();
                return;
            }
            if (e.key === 'ArrowLeft' && e.shiftKey) {
                options.onMoveLeft?.();
                return;
            }
            if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                const columnIndex = parseInt(e.key) - 1;
                options.onJumpToColumn?.(columnIndex);
                return;
            }
            // If Kanban shows an open mail detail, allow MailContent shortcuts too
            if (options.isEmailOpen) {
                // Handle shift+I / shift+U explicitly
                if (e.shiftKey && e.key.toLowerCase() === 'i') {
                    options.onMarkRead?.();
                    return;
                }
                if (e.shiftKey && e.key.toLowerCase() === 'u') {
                    options.onMarkUnread?.();
                    return;
                }

                switch (e.key.toLowerCase()) {
                    case 'e':
                    case 'y':
                        options.onArchive?.();
                        return;
                    case 's':
                        options.onStar?.();
                        return;
                    case 'r':
                        options.onReply?.();
                        return;
                    case 'f':
                        options.onForward?.();
                        return;
                    case 'g':
                        options.onOpenInGmail?.();
                        return;
                    case 'd':
                    case '#':
                        options.onDelete?.();
                        return;
                }
            }
        }

        // Xử lý phím tắt trong chế độ Compose/Forward
        if (options.isComposing || options.isForwarding) {
            return; // Các modal sẽ tự xử lý phím tắt
        }

        // Xử lý phím tắt khi email đang mở
        if (options.isEmailOpen) {
            // Handle shift+I / shift+U explicitly (e.key doesn't include modifier names)
            if (e.shiftKey && e.key.toLowerCase() === 'i') {
                options.onMarkRead?.();
                return;
            }
            if (e.shiftKey && e.key.toLowerCase() === 'u') {
                options.onMarkUnread?.();
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'esc':
                    options.onCloseEmail?.();
                    break;
                case 'm':
                    options.onToggleRead?.();
                    break;
                case 'e':
                case 'y': // 'y' là phím tắt archive trong Gmail
                    options.onArchive?.();
                    break;
                case 's':
                    options.onStar?.();
                    break;
                case 'r':
                    options.onReply?.();
                    break;
                case 'f':
                    options.onForward?.();
                    break;
                case 'g':
                    options.onOpenInGmail?.();
                    break;
                case 'd':
                case '#':
                    options.onDelete?.();
                    break;
            }
        }

        // Xử lý phím tắt trong chế độ list/inbox
        // Handle Shift+I / Shift+U in list mode as well
        if (e.shiftKey && e.key.toLowerCase() === 'i') {
            options.onMarkRead?.();
            return;
        }
        if (e.shiftKey && e.key.toLowerCase() === 'u') {
            options.onMarkUnread?.();
            return;
        }

        // Toggle read/unread with 'm'
        if (e.key.toLowerCase() === 'm') {
            options.onToggleRead?.();
            return;
        }

        switch (e.key.toLowerCase()) {
            // Điều hướng cơ bản trong danh sách email
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

            // Tác vụ trên email
            case 'x':
                options.onSelectToggle?.();
                break;
            case 'e':
            case 'y': // 'y' là shortcut archive trong Gmail
                options.onArchive?.();
                break;
            case 's':
                options.onStar?.();
                break;
            case 'd':
            case '#':
                options.onDelete?.();
                break;


            // Tác vụ toàn cục
            case 'c':
                options.onCompose?.();
                break;
            case '/':
                options.onSearch?.();
                break;
            case '?':
                if (e.shiftKey) {
                    setShowShortcuts(prev => !prev);
                }
                break;
            case 'tab':
                if (e.shiftKey) {
                    options.onPreviousColumn?.();
                } else {
                    options.onNextColumn?.();
                }
                break;
        }

        // Xử lý các phím tắt với Ctrl/Cmd
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'k':
                    options.onSearch?.();
                    break;
                case '/':
                    options.onClearSearch?.();
                    break;
            }
        }
    }, [options, showShortcuts]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyPress as unknown as EventListener);
        return () => window.removeEventListener('keydown', handleKeyPress as unknown as EventListener);
    }, [handleKeyPress]);

    return {
        showShortcuts,
        setShowShortcuts,
    };
};

// Keyboard Shortcuts Modal Component
export const KEYBOARD_SHORTCUTS = [
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
        category: 'Navigation',
        items: [
            { keys: ['j', '↓'], description: 'Next email' },
            { keys: ['k', '↑'], description: 'Previous email' },
            { keys: ['Enter'], description: 'Open email' },
            { keys: ['Esc'], description: 'Close email' },
            // { keys: ['Tab'], description: 'Next column' },
            // { keys: ['Shift', 'Tab'], description: 'Previous column' },
        ],
    },
    {
        category: 'Actions',
        items: [
            { keys: ['g'], description: 'Open in Gmail' },
            { keys: ['s'], description: 'Star' },
            { keys: ['e'], description: 'Archive' },
            { keys: ['m'], description: 'Mark as read / unread' },
            { keys: ['#'], description: 'Delete' },
        ],
    },

    //   {
    //     category: 'Kanban',
    //     items: [
    //       { keys: ['Shift', '→'], description: 'Move to next column' },
    //       { keys: ['Shift', '←'], description: 'Move to previous column' },
    //       { keys: ['1-9'], description: 'Jump to column' },
    //     ],
    //   },
    {
        category: 'Other',
        items: [
            { keys: ['/'], description: 'Search' },
            { keys: ['Ctrl', '/'], description: 'Clear search' },
            { keys: ['?'], description: 'Show shortcuts' },
        ],
    },
];

export const KeyboardShortcutsModal = ({
    isOpen,
    onClose
}: {
    isOpen: boolean;
    onClose: () => void
}) => {
    if (!isOpen) return null;

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
                        {KEYBOARD_SHORTCUTS.map((section) => (
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
