import { json, withAuth } from "@/lib/api";

/** Most recent notifications for the signed-in user. */
export const GET = withAuth("tickets.read", async (_req, { user, db }) => {
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return json({
    notifications,
    unread: notifications.filter((n) => !n.readAt).length,
  });
});

/** Marks every unread notification for the signed-in user as read. */
export const POST = withAuth("tickets.read", async (_req, { user, db }) => {
  const { count } = await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return json({ ok: true, marked: count });
});
