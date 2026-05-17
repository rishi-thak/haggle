import { NextResponse } from "next/server";
import { getPendingFollowUps, markFollowUpSent } from "@/lib/followup";
import { sendIMessage } from "@/lib/agentphone";
import { getUserByConversation, logMessage } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const pending = await getPendingFollowUps();
  let sent = 0;

  for (const followup of pending) {
    try {
      const user = await getUserByConversation(followup.conversation_id);
      const msg = `hey how'd it go with ${followup.provider_name.toLowerCase()}? worth saving for next time?`;
      await sendIMessage(followup.conversation_id, msg, user?.phone);
      await logMessage({
        jobId: followup.job_id,
        direction: "outbound",
        channel: "imessage",
        body: msg,
      });
      await markFollowUpSent(followup._id);
      sent++;
    } catch (e) {
      console.error("[cron/followup] failed to send followup", followup._id, e);
    }
  }

  return NextResponse.json({ ok: true, sent, total: pending.length });
}
