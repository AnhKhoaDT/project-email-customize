"use client";

import { useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Mail } from "@/types";
import { type EmailData } from "@/types";
 import { useToast } from "@/contexts/toast-context";

interface ForwardModalProps {
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
  originalMail: EmailData;
}

const ForwardModal = ({
  isOpen,
  onClose,
  onSend,
  originalMail,
}: ForwardModalProps) => {
  const { showToast } = useToast();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(
    `Fwd: ${originalMail.subject || "No subject"}`
  );
  const [body, setBody] = useState(
    `\n\n---------- Forwarded message ---------\nFrom: ${
      originalMail.from
    }\nDate: ${originalMail.date}\nSubject: ${originalMail.subject}\nTo: ${
      originalMail.to || ""
    }\n\n${originalMail.snippet || ""}`
  );
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [toError, setToError] = useState("");

  const handleSend = async () => {
    // Validation
    if (!to.trim()) {
      setToError("Recipient is required");
      return;
    }
    setToError("");

    setIsSending(true);
    try {
      await onSend({
        to: to
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean),
        cc: cc
          ? cc
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean)
          : undefined,
        bcc: bcc
          ? bcc
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean)
          : undefined,
        subject,
        body,
        isHtml: false,
      });

      // Reset form
      setTo("");
      setCc("");
      setBcc("");
      setShowCc(false);
      setShowBcc(false);
      onClose();
    } catch (error) {
      console.error("Failed to forward email:", error);
      showToast("Failed to forward email. Please try again.", "error");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Forward Message</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
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
              rows={12}
              className="flex-1 min-h-[250px] px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ForwardModal;
