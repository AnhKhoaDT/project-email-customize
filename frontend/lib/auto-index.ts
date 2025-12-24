"use client";

/**
 * Auto-Index Service
 * Automatically indexes emails for semantic search on first login
 * Runs in background without blocking UI
 */

const AUTO_INDEX_KEY = "email_auto_indexed";
const AUTO_INDEX_VERSION = "v1"; // Increment to re-index all users

interface IndexStatus {
  indexed: boolean;
  version: string;
  timestamp: number;
  emailCount: number;
}

export class AutoIndexService {
  private static isIndexing = false;

  /**
   * Check if user has been indexed
   */
  static hasBeenIndexed(userId: string): boolean {
    try {
      const key = `${AUTO_INDEX_KEY}_${userId}`;
      const stored = localStorage.getItem(key);
      
      if (!stored) return false;

      const status: IndexStatus = JSON.parse(stored);
      
      // Check version to allow re-indexing when we update the system
      return status.indexed && status.version === AUTO_INDEX_VERSION;
    } catch {
      return false;
    }
  }

  /**
   * Mark user as indexed
   */
  private static markAsIndexed(userId: string, emailCount: number): void {
    try {
      const key = `${AUTO_INDEX_KEY}_${userId}`;
      const status: IndexStatus = {
        indexed: true,
        version: AUTO_INDEX_VERSION,
        timestamp: Date.now(),
        emailCount,
      };
      localStorage.setItem(key, JSON.stringify(status));
    } catch (error) {
      console.error("[AutoIndex] Failed to mark as indexed:", error);
    }
  }

  /**
   * Auto-index emails in background
   * @param userId - User ID
   * @param accessToken - Access token for API calls
   * @param limit - Max emails to index (default: 200, matches fuzzy search)
   */
  static async autoIndex(
    userId: string,
    accessToken: string,
    limit: number = 200
  ): Promise<void> {
    // Prevent duplicate indexing
    if (this.isIndexing) {
      console.log("[AutoIndex] Already indexing, skip");
      return;
    }

    // Check if already indexed
    if (this.hasBeenIndexed(userId)) {
      console.log("[AutoIndex] User already indexed, skip");
      return;
    }

    try {
      this.isIndexing = true;
      console.log(`[AutoIndex] Starting background indexing for ${userId}...`);

      const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
      
      const response = await fetch(`${apiURL}/search/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ limit }),
      });

      if (!response.ok) {
        throw new Error(`Index failed: ${response.status}`);
      }

      const data = await response.json();
      const indexed = data.data?.indexed || data.indexed || 0;

      console.log(`[AutoIndex] ✅ Successfully indexed ${indexed} emails`);
      
      // Mark as indexed
      this.markAsIndexed(userId, indexed);

      // Show subtle notification (optional)
      if (indexed > 0) {
        this.showNotification(indexed);
      }
    } catch (error) {
      console.error("[AutoIndex] Failed to auto-index:", error);
      // Don't throw - indexing failure shouldn't break user experience
      // User can manually index later if needed
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Show subtle notification about indexing completion
   */
  private static showNotification(count: number): void {
    // Check if user wants notifications
    if (typeof window !== "undefined" && "Notification" in window) {
      // Don't request permission, just use if already granted
      if (Notification.permission === "granted") {
        new Notification("Semantic Search Ready", {
          body: `${count} emails indexed for AI-powered search`,
          icon: "/favicon.ico",
          tag: "auto-index",
        });
      }
    }

    // Also console log for developers
    console.log(`[AutoIndex] 🎉 Semantic search ready! ${count} emails indexed.`);
  }

  /**
   * Force re-index (useful for testing or when user requests)
   */
  static async forceReindex(
    userId: string,
    accessToken: string,
    limit: number = 50
  ): Promise<void> {
    // Clear indexed flag
    const key = `${AUTO_INDEX_KEY}_${userId}`;
    localStorage.removeItem(key);
    
    // Re-index
    await this.autoIndex(userId, accessToken, limit);
  }

  /**
   * Get index status for UI display
   */
  static getIndexStatus(userId: string): IndexStatus | null {
    try {
      const key = `${AUTO_INDEX_KEY}_${userId}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear index status (for logout)
   */
  static clearIndexStatus(userId: string): void {
    try {
      const key = `${AUTO_INDEX_KEY}_${userId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error("[AutoIndex] Failed to clear status:", error);
    }
  }
}
