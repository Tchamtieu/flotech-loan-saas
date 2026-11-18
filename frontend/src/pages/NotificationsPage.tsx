import React, { useCallback, useEffect, useState } from 'react';
import type { NotificationItemDTO } from '@flotech/shared';
import { Bell, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import {
  DataTableContainer,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
} from '@/components/ui/DataTable';
import { getActiveAppCheckToken } from '@/config/firebaseClient';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  fetchTenantNotificationsApi,
  markTenantNotificationReadApi,
} from '@/services/apiClient';

export function NotificationsPage(): React.ReactElement {
  const { firebaseUser, activeBusinessId } = useAuthSession();

  const [notifications, setNotifications] = useState<NotificationItemDTO[]>([]);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await fetchTenantNotificationsApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        unreadOnly
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setNotifications(res.data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load notifications.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (notificationId: string) => {
    if (!firebaseUser || !activeBusinessId) return;
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await markTenantNotificationReadApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        notificationId
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      await loadNotifications();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to mark notification as read.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">PHASE 9 — IN-APP NOTIFICATIONS</Badge>
            <span className="text-xs font-mono text-slate-500">
              PostgreSQL notifications Table
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-flotech-navy">
            Operational &amp; Platform Notifications
          </h1>
          <p className="text-sm text-slate-600">
            Real-time repayment receipt alerts, delinquency warnings, and FloTech Digital platform broadcasts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-flotech-primary"
            />
            <span>Unread Only</span>
          </label>
          <Button
            variant="outline"
            onClick={() => void loadNotifications()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Notification Feed</CardTitle>
              <CardDescription>
                Notifications scoped to your authenticated user account and active business tenant.
              </CardDescription>
            </div>
            <Bell className="h-4 w-4 text-flotech-primary" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTableContainer>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Category &amp; Status</DataTableHeaderCell>
                <DataTableHeaderCell>Message</DataTableHeaderCell>
                <DataTableHeaderCell>Timestamp</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Action</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {notifications.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                    {isLoading
                      ? 'Loading notifications...'
                      : 'No notifications found.'}
                  </DataTableCell>
                </DataTableRow>
              ) : (
                notifications.map((n) => (
                  <DataTableRow key={n.id}>
                    <DataTableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={n.isRead ? 'neutral' : 'primary'}>
                          {n.isRead ? 'READ' : 'UNREAD'}
                        </Badge>
                        <span className="font-mono text-xs text-slate-600">
                          {n.category}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-semibold text-flotech-navy">{n.title}</div>
                      <div className="text-xs text-slate-600">{n.body}</div>
                    </DataTableCell>
                    <DataTableCell className="font-mono text-xs text-slate-500">
                      {n.createdAt.slice(0, 19).replace('T', ' ')}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      {!n.isRead && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleMarkRead(n.id)}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Mark Read
                        </Button>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </tbody>
          </DataTableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
