export type NotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_ASSIGNED'
  | 'ORDER_QUEUED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_READY_FOR_DELIVERY'
  | 'ORDER_CANCELLED'
  | 'ORDER_DELIVERED'
  | 'ORDER_REASSIGNED';

export interface NotificationItemView {
  readonly id: string;
  readonly repairOrderId: string;
  readonly ticketCode: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly actorFullName: string;
  readonly isRead: boolean;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface NotificationsFeedView {
  readonly unreadCount: number;
  readonly items: ReadonlyArray<NotificationItemView>;
}
