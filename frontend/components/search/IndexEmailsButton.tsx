"use client";

import { useState, useEffect } from "react";
import { HiSparkles } from "react-icons/hi";
import { TbDatabase, TbRefresh, TbCheck } from "react-icons/tb";

interface IndexStats {
  totalEmails: number;
  indexedEmails: number;
  percentage: number;
}

interface IndexEmailsButtonProps {
  onIndexComplete?: () => void;
}

/**
 * IndexEmailsButton Component
 * Button to index emails for semantic search with progress tracking
 * 
 * Features:
 * - Fetch current index stats
 * - Trigger indexing process
 * - Show progress during indexing
 * - Display completion status
 */
export default function IndexEmailsButton({ onIndexComplete }: IndexEmailsButtonProps) {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch index stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setIsLoadingStats(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) return;

      const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiURL}/search/index/stats`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch stats");

      const data = await response.json();
      setStats({
        totalEmails: data.data?.totalEmails || 0,
        indexedEmails: data.data?.indexedEmails || 0,
        percentage: data.data?.percentage || 0,
      });
    } catch (err: any) {
      console.error("Failed to fetch index stats:", err);
      setError(err.message);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleIndex = async () => {
    setIsIndexing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = typeof window !== "undefined" ? window.__accessToken : null;
      if (!token) return;

      const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiURL}/search/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ limit: 100 }), // Index up to 100 emails
      });

      if (!response.ok) throw new Error("Indexing failed");

      const data = await response.json();
      const indexed = data.data?.indexed || 0;
      const skipped = data.data?.skipped || 0;

      setSuccessMessage(`✅ Indexed ${indexed} emails (${skipped} already indexed)`);

      // Refresh stats after indexing
      setTimeout(() => {
        fetchStats();
        onIndexComplete?.();
      }, 1000);

      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      setError(err.message || "Failed to index emails");
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Index Stats Display */}
      {stats && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <TbDatabase size={14} />
          <span>
            {stats.indexedEmails} / {stats.totalEmails} emails indexed ({stats.percentage.toFixed(0)}%)
          </span>
        </div>
      )}

      {/* Index Button */}
      <button
        onClick={handleIndex}
        disabled={isIndexing || isLoadingStats}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
          ${
            isIndexing
              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 cursor-wait"
              : "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500 dark:hover:bg-purple-600"
          }
          ${isLoadingStats ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {isIndexing ? (
          <>
            <TbRefresh size={16} className="animate-spin" />
            <span>Indexing...</span>
          </>
        ) : (
          <>
            <HiSparkles size={16} />
            <span>Index Emails for AI Search</span>
          </>
        )}
      </button>

      {/* Progress Bar */}
      {stats && stats.percentage > 0 && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-purple-600 dark:bg-purple-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${stats.percentage}%` }}
          ></div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs">
          <TbCheck size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
