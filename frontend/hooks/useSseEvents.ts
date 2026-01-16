import { useEffect, useRef } from 'react';

interface EventPayload {
  userId?: string;
  emailId: string;
  toColumnId?: string;
  timestamp?: string;
}

// Simple SSE hook - expects server SSE at /events/sse and auth via cookie/session
export default function useSseEvents(onEmailRestored: (payload: EventPayload) => void) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const apiURL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:5000';
      const token = (window as any).__accessToken || null;
      const sseUrl = token ? `${apiURL.replace(/\/$/, '')}/events/sse?token=${encodeURIComponent(token)}` : `${apiURL.replace(/\/$/, '')}/events/sse`;
      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.addEventListener('message', (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          // Accept both {event, data} envelope and raw payload
          const payload = parsed?.data ? parsed.data : parsed;
          if (parsed?.event === 'email.restored' || payload?.toColumnId) {
            onEmailRestored(payload);
          }
        } catch (e) {
          // ignore malformed messages
          // console.warn('SSE parse error', e);
        }
      });

      es.onerror = (err) => {
        // reconnect logic could be added here
        console.warn('SSE error', err);
      };

      return () => {
        es.close();
        esRef.current = null;
      };
    } catch (err) {
      console.warn('Failed to open SSE', err);
    }
  }, [onEmailRestored]);
}
