"use client";

import { useMe, useMembers, useRepoActivity } from "@/lib/api/queries";
import { ActivityFeed } from "@/components/activity/feed";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";

export function RepoActivity({ id }: { id: string }) {
  const events = useRepoActivity(id, 100);
  const members = useMembers(id);
  const me = useMe();
  const names = new Map(members.data?.map((m) => [m.user_id, m.display_name ?? "A member"]));
  const actor = (uid: string) => (uid === me.data?.id ? "You" : (names.get(uid) ?? "A former member"));

  return (
    <section aria-labelledby="ra-h" className="max-w-[60rem]">
      <div className="mb-1 border-b border-line pb-2">
        <h2 id="ra-h" className="text-lg font-bold">Activity</h2>
        <p className="text-xs text-fg-2">Commits, branches, settings and membership changes, newest first.</p>
      </div>
      {events.isPending ? <SkeletonRows rows={6} label="Loading activity" /> : null}
      {events.isError ? <ErrorState error={events.error} retry={() => events.refetch()} compact /> : null}
      {events.isSuccess && !events.data.length ? <EmptyState art="no-activity" title="No activity yet" compact /> : null}
      {events.data?.length ? <ActivityFeed events={events.data} names={{ repo: () => undefined, actor }} showRepo={false} /> : null}
      {events.data?.length === 100 ? <p className="mt-4 text-2xs text-fg-3">Showing the latest 100 events.</p> : null}
    </section>
  );
}
