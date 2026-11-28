import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNotificationContext } from './notification-context';
import { useMe } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { playNotificationChime } from '@/lib/sound-utils';

type WebSocketContextType = {
  connected: boolean;
  send: (message: any) => void;
};

const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  send: () => {},
});

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const { toast } = useToast();
  const { addNotification } = useNotificationContext();

  // The server identifies the user from their login session cookie,
  // so we (re)connect whenever the logged-in user changes.
  const { data: currentUser } = useMe();
  const userId = currentUser?.id;

  useEffect(() => {
    if (!userId) return;
    let closedByUs = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => setConnected(false);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'notification') return;

          addNotification({
            title: data.data.title || 'New Notification',
            message: data.data.message,
            type: (data.data.notificationType || 'info') as 'info' | 'success' | 'warning' | 'spin' | 'goodDay',
            timestamp: new Date(),
            ...(data.data.data?.clickable && data.data.data?.action
              ? { clickable: true, action: data.data.data.action }
              : {}),
          });

          if (data.data.notificationType === 'goodDay') {
            playNotificationChime(0.45);
            toast({ title: data.data.title || 'Celebration!', description: data.data.message, duration: 8000 });
          } else {
            toast({
              title: data.data.title || 'New Notification',
              description: data.data.message,
              variant: data.data.notificationType === 'warning' ? 'destructive' : 'default',
            });
          }

          queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
          queryClient.invalidateQueries({ queryKey: ['/api/children'] });
          queryClient.invalidateQueries({ queryKey: ['/api/auth/me/profile'] });
          queryClient.invalidateQueries({ queryKey: ['pendingSpinRequests'] });
          queryClient.invalidateQueries({ queryKey: ['/api/spinrequests/mine'] });
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [userId]);

  const send = (message: any) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  return (
    <WebSocketContext.Provider value={{ connected, send }}>
      {children}
    </WebSocketContext.Provider>
  );
};
