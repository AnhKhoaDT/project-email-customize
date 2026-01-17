'use client';

import { useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { useToast } from '@/contexts/toast-context';
import { useEffect } from 'react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (emailData: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml: boolean;
  }) => Promise<void>;
}

const ComposeModal = ({ isOpen, onClose, onSend }: ComposeModalProps) => {
  const { showToast } = useToast();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [toError, setToError] = useState('');

  const handleSend = async () => {
    // Validate recipient (same behavior as ForwardModal)
    if (!to.trim()) {
      setToError('Recipient is required');
      return;
    }
    setToError('');

    setIsSending(true);
    try {
      await onSend({
        to: to.split(',').map(email => email.trim()).filter(Boolean),
        cc: cc ? cc.split(',').map(email => email.trim()).filter(Boolean) : undefined,
        bcc: bcc ? bcc.split(',').map(email => email.trim()).filter(Boolean) : undefined,
        subject,
        body,
        isHtml: false,
      });

      // Reset form
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setBody('');
      setShowCc(false);
      setShowBcc(false);
      setToError('');
      showToast('Email sent successfully', 'success');
      onClose();
    } catch (error: any) {
      console.error('Failed to send email:', error);
      showToast(`Failed to send email: ${error.message || 'Please try again'}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: globalThis.KeyboardEvent) => {
      // Allow opening/toggling shortcuts with Shift+? (let global handler run)
      if (e.key === '?' && e.shiftKey) {
        return;
      }

      // Close on Escape
      if (e.key === 'Escape') {
        try { e.stopImmediatePropagation(); } catch { }
        e.preventDefault();
        onClose();
        return;
      }

      // Block other keys from reaching global handlers while modal is open
      try { e.stopImmediatePropagation(); } catch { }

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      const isEditable = tag === 'textarea' || tag === 'input' || (active?.isContentEditable === true);

      // Close with 'c' when not typing
      if (e.key.toLowerCase() === 'c' && !isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onClose();
        return;
      }

      // Alt+c / Alt+b to open Cc /Bcc 
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key.toLowerCase() === 'c') {
          if (!showCc) {
            // open Cc
            e.preventDefault();
            setShowCc(true);
            return;
          }
          else {
            // close Cc
            e.preventDefault();
            setShowCc(false);
            return
          }
        }
        if (e.key.toLowerCase() === 'b') {
          if (!showBcc) {
            // open Bcc
            e.preventDefault();
            setShowBcc(true);
            return;
          }
          else {
            // close Bcc
            e.preventDefault();
            setShowBcc(false);
            return
          }
        }
      }

        //
        if (e.altKey && e.key.toLowerCase() === 'c' && !isEditable && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (!isSending)
            return;
        }


        // Ctrl/Cmd+Enter -> send
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (!isSending) handleSend();
          return;
        }

        // Enter when not focused in textarea/input -> send
        if (e.key === 'Enter' && !isEditable) {
          e.preventDefault();
          if (!isSending) handleSend();
          return;
        }

        // For editable fields, allow default typing but global propagation was stopped above
        if (isEditable) {
          return;
        }

        // For other non-editable keys, prevent default to avoid unintended effects
        e.preventDefault();
      };

      // Use capture to intercept keys before other listeners
      window.addEventListener('keydown', handleKey as EventListener, true);
      return () => window.removeEventListener('keydown', handleKey as EventListener, true);
    }, [isOpen, isSending, handleSend]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">New Message</h2>
          <button
            onClick={onClose}
            className="hover:text-primary hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-3">
          {/* To Field */}
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="to" className="w-16 text-right">
                To:
              </Label>
              <Input
                id="to"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  if (toError) setToError("");
                }}
                placeholder="recipient@example.com"
                className={`flex-1 ${toError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              />
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  onClick={() => setShowBcc(true)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Bcc
                </button>
              )}
            </div>
            {toError && (
              <div className="flex items-center gap-2">
                <div className="w-16"></div>
                <p className="text-sm text-red-500 mt-1">{toError}</p>
              </div>
            )}
          </div>

          {/* Cc Field */}
          {showCc && (
            <div className="flex items-center gap-2">
              <Label htmlFor="cc" className="w-16 text-right">
                Cc:
              </Label>
              <Input
                id="cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
                className="flex-1"
              />
            </div>
          )}

          {/* Bcc Field */}
          {showBcc && (
            <div className="flex items-center gap-2">
              <Label htmlFor="bcc" className="w-16 text-right">
                Bcc:
              </Label>
              <Input
                id="bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="bcc@example.com"
                className="flex-1"
              />
            </div>
          )}

          {/* Subject Field */}
          <div className="flex items-center gap-2">
            <Label htmlFor="subject" className="w-16 text-right">
              Subject:
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="flex-1"
            />
          </div>

          {/* Body Field */}
          <div className="flex gap-2">
            <Label htmlFor="body" className="w-16 text-right pt-2">
              Message:
            </Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message here..."
              rows={10}
              className="flex-1 min-h-[200px] px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ComposeModal;
