import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'spin' | 'goodDay' | 'info' | 'success' | 'warning';
  read: boolean;
  timestamp?: Date;
  clickable?: boolean;
  action?: string;
}

const notificationVariants = cva("relative rounded-2xl border bg-card pl-5 pr-9 py-3.5 shadow-xl animate-rise before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full", {
  variants: {
    type: {
      spin: "before:bg-primary",
      goodDay: "before:bg-success",
      info: "before:bg-primary",
      success: "before:bg-success",
      warning: "before:bg-reward",
    },
  },
  defaultVariants: { type: "info" },
});

export const NotificationItem = ({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) => {
  const timestamp = notification.timestamp ? new Date(notification.timestamp).toLocaleString() : null;

  const handleClick = () => {
    if (notification.clickable && notification.action) {
      window.location.href = notification.action;
    }
  };

  return (
    <Alert
      className={`${notificationVariants({ type: notification.type })} ${notification.clickable ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
      onClick={handleClick}
    >
      <AlertTitle className="mb-1 font-bold">{notification.title}</AlertTitle>
      <AlertDescription className="text-sm">
        {notification.message}
        {timestamp && <div className="text-xs opacity-70 mt-1">{timestamp}</div>}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 h-6 w-6 rounded-full p-0"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
      >
        <X size={14} />
      </Button>
    </Alert>
  );
};

export const NotificationCenter = ({ notifications, onDismiss }: { notifications: Notification[]; onDismiss: (id: string) => void }) => {
  if (notifications.length === 0) return null;
  return (
    <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-80 z-50 space-y-2 max-h-[80vh] overflow-y-auto" role="status" aria-live="polite">
      {notifications.map(notification => (
        <NotificationItem key={notification.id} notification={notification} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Omit<Notification, 'id' | 'read'>) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { ...notification, id, read: false }]);
    // Auto-dismiss so pop-ups don't pile up over the tabs on phones.
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 8000);
  };

  const dismissNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));
  const clearAllNotifications = () => setNotifications([]);


  return { notifications, addNotification, dismissNotification, clearAllNotifications };
};
