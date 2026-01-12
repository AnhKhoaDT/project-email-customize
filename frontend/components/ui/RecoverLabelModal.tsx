"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { fetchGmailLabels, remapColumnLabel, deleteKanbanColumn } from "@/lib/api";
import { useToast } from "@/contexts/toast-context";

interface RecoverLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnId: string;
  columnName: string;
  originalLabel?: string;
  onSuccess: (serverData?: any) => void;
  onApplyOptimistic?: (columnId: string, patch: any) => (() => void);
  existingColumns?: any[]; // For validation against duplicate labels
}

const RecoverLabelModal: React.FC<RecoverLabelModalProps> = ({
  isOpen,
  onClose,
  columnId,
  columnName,
  originalLabel,
  onSuccess,
  onApplyOptimistic,
  existingColumns = [],
}) => {
  const { showToast } = useToast();
  const [recoveryOption, setRecoveryOption] = useState<"remap" | "create" | "delete">("create");
  const [gmailLabels, setGmailLabels] = useState<any[]>([]);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [newLabelName, setNewLabelName] = useState(columnName);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  // Gmail reserved label names
  const GMAIL_RESERVED_LABELS = [
    'inbox', 'sent', 'drafts', 'spam', 'trash', 'starred', 
    'important', 'unread', 'chat', 'scheduled', 'snoozed'
  ];

  // Validation helpers
  const isReservedGmailLabel = (labelName: string): boolean => {
    return GMAIL_RESERVED_LABELS.includes(labelName.toLowerCase().trim());
  };

  const checkGmailLabelExists = (labelName: string): boolean => {
    return gmailLabels.some((label: any) => 
      label.name.toLowerCase() === labelName.toLowerCase()
    );
  };

  const checkDuplicateGmailLabel = (label: string): boolean => {
    return existingColumns.some((col: any) => 
      col.id !== columnId && // Exclude current column
      col.gmailLabel && col.gmailLabel.toLowerCase() === label.toLowerCase()
    );
  };

  // Fetch Gmail labels when modal opens
  useEffect(() => {
    if (isOpen) {
      loadGmailLabels();
      setValidationError("");
      setError("");
      setNewLabelName(columnName);
    }
  }, [isOpen]);

  // Real-time validation when inputs change
  useEffect(() => {
    if (!isOpen) {
      setValidationError("");
      return;
    }

    const trimmedName = newLabelName.trim();

    // Validate create option
    if (recoveryOption === "create") {
      if (!trimmedName) {
        setValidationError("");
        return;
      }

      // Check reserved labels
      if (isReservedGmailLabel(trimmedName)) {
        setValidationError(`Cannot use reserved Gmail label name "${trimmedName}". Reserved labels: ${GMAIL_RESERVED_LABELS.join(', ')}`);
        return;
      }

      // Check if label already exists on Gmail
      if (checkGmailLabelExists(trimmedName)) {
        setValidationError(`Gmail label "${trimmedName}" already exists. Please use "Remap to different label" option or choose a different name.`);
        return;
      }

      // Check if label is already mapped to another column
      if (checkDuplicateGmailLabel(trimmedName)) {
        setValidationError(`Gmail label "${trimmedName}" is already mapped to another column`);
        return;
      }
    }

    // Validate remap option
    if (recoveryOption === "remap" && selectedLabel) {
      if (checkDuplicateGmailLabel(selectedLabel)) {
        setValidationError(`Gmail label "${selectedLabel}" is already mapped to another column`);
        return;
      }
    }

    // Clear error if all validations pass
    setValidationError("");
  }, [newLabelName, recoveryOption, selectedLabel, isOpen, gmailLabels, existingColumns]);

  const loadGmailLabels = async () => {
    setIsLoadingLabels(true);
    try {
      const labels = await fetchGmailLabels();
      console.log("📧 Fetched Gmail labels for recovery:", labels);
      setGmailLabels(Array.isArray(labels) ? labels : []);
    } catch (err: any) {
      console.error("❌ Failed to fetch Gmail labels:", err);
      setGmailLabels([]);
      setError("Failed to load Gmail labels. Please try again.");
    } finally {
      setIsLoadingLabels(false);
    }
  };

  const handleRecover = async () => {
    setIsLoading(true);
    setError("");
    let rollback: (() => void) | undefined;

    try {
      if (recoveryOption === "create") {
        // Create new Gmail label - sync with createKanbanColumn logic
        const trimmedName = newLabelName.trim();
        if (!trimmedName) {
          setError("Label name is required");
          setIsLoading(false);
          return;
        }

        // Optimistic update: set gmailLabelName immediately (no id yet)
        rollback = onApplyOptimistic?.(columnId, { gmailLabel: trimmedName, gmailLabelName: trimmedName }) ;

        const res = await remapColumnLabel(columnId, {
          createNewLabel: true,
          labelName: trimmedName,
        });

        showToast(`Label "${trimmedName}" created and mapped successfully`, "success");
        onSuccess(res);
        onClose();
      } else if (recoveryOption === "remap") {
        // Remap to existing label - use labelId/labelName
        if (!selectedLabel) {
          setError("Please select a Gmail label");
          setIsLoading(false);
          return;
        }

        // Optimistic update: set gmailLabel/gmailLabelName immediately
        const selName = gmailLabels.find(l => l.id === selectedLabel || l.name === selectedLabel)?.name || selectedLabel;
        rollback = onApplyOptimistic?.(columnId, { gmailLabel: selectedLabel, gmailLabelName: selName });

        const res = await remapColumnLabel(columnId, {
          newGmailLabel: selectedLabel,
        });

        showToast(`Column remapped to "${selName}" successfully`, "success");
        onSuccess(res);
        onClose();
      } else if (recoveryOption === "delete") {
        // Delete column - sync with page.tsx delete logic
        // Optimistic delete
        rollback = onApplyOptimistic?.(columnId, { _delete: true });

        await deleteKanbanColumn(columnId);

        showToast(`Column "${columnName}" deleted successfully`, "success");
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || "Recovery failed";
      console.error("❌ Recovery error:", errorMessage);
      setError(errorMessage);
      showToast(errorMessage, "error");

      // Rollback optimistic update if provided
      try {
        rollback?.();
      } catch (rbErr) {
        console.error('Rollback failed', rbErr);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const systemLabels = gmailLabels.filter(l => l.type === "system");
  const userLabels = gmailLabels.filter(l => l.type === "user");
  
  // Resolve original label name when possible (originalLabel may be a Gmail label ID)
  const resolvedOriginalLabel = (() => {
    if (!originalLabel) return null;

    // 1) Prefer DB-stored friendly name for this column if available
    const col = existingColumns.find((c: any) => c.id === columnId);
    if (col) {
      if (col.gmailLabelName) return col.gmailLabelName;
      if (col.name) return col.name;
    }

    // 2) Try to resolve from live Gmail labels
    const found = gmailLabels.find((l: any) => l.id === originalLabel || l.name === originalLabel);
    if (found) return found.name;

    // 3) Fallback to the raw original value (likely an ID)
    return originalLabel;
  })();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recover Column: {columnName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Validation Error */}
          {validationError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-red-500 text-sm">⚠️</span>
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  {validationError}
                </p>
              </div>
            </div>
          )}

          {/* Info Message */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="text-yellow-500">⚠️</span>
              <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                <p className="font-semibold text-yellow-700 dark:text-yellow-400">
                  Gmail label not found
                </p>
                <p className="mt-1">
                  {resolvedOriginalLabel ? `Label "${resolvedOriginalLabel}"` : "The Gmail label"} was deleted or is invalid.
                </p>
              </div>
            </div>
          </div>

          {/* Recovery Options */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Choose recovery option:
            </p>

            {/* Option 1: Create New Label */}
            <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="recoveryOption"
                value="create"
                checked={recoveryOption === "create"}
                onChange={(e) => setRecoveryOption(e.target.value as any)}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Create new Gmail label
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Creates a new label with the same name
                </p>
                
                {recoveryOption === "create" && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      placeholder="Label name"
                      className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-[#121212] text-gray-900 dark:text-gray-100 focus:ring-2 focus:border-transparent transition-all ${
                        validationError && newLabelName.trim()
                          ? "border-red-500 focus:ring-red-500" 
                          : "border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-600"
                      }`}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      Gmail will auto-assign a color to the new label
                    </p>
                  </div>
                )}
              </div>
            </label>

            {/* Option 2: Remap to Existing Label */}
            <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="recoveryOption"
                value="remap"
                checked={recoveryOption === "remap"}
                onChange={(e) => setRecoveryOption(e.target.value as any)}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Remap to different label
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Choose an existing Gmail label
                </p>

                {recoveryOption === "remap" && (
                  <select
                    value={selectedLabel}
                    onChange={(e) => setSelectedLabel(e.target.value)}
                    disabled={isLoadingLabels}
                    className="mt-3 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#121212] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {isLoadingLabels ? "Loading labels..." : "Select a label..."}
                    </option>
                    
                    {systemLabels.length > 0 && (
                      <optgroup label="System Labels">
                        {systemLabels.map((label) => (
                          <option key={label.id} value={label.name}>
                            {label.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    
                    {userLabels.length > 0 && (
                      <optgroup label="Custom Labels">
                        {userLabels.map((label) => (
                          <option key={label.id} value={label.name}>
                            {label.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
            </label>

            {/* Option 3: Delete Column */}
            <label className="flex items-start gap-3 p-3 border border-red-200 dark:border-red-800 rounded-lg cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <input
                type="radio"
                name="recoveryOption"
                value="delete"
                checked={recoveryOption === "delete"}
                onChange={(e) => setRecoveryOption(e.target.value as any)}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="font-medium text-red-700 dark:text-red-400">
                  Delete this column
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Permanently remove column from Kanban board
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleRecover}
            disabled={
              isLoading || 
              !!validationError || 
              (recoveryOption === "create" && !newLabelName.trim()) ||
              (recoveryOption === "remap" && !selectedLabel)
            }
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : recoveryOption === "delete" ? "Delete Column" : "Recover"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecoverLabelModal;
