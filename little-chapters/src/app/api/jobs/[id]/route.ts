import { handle } from "@/server/api";
import { requireUser, getActiveFamilyId } from "@/server/auth/session";
import { getJobForFamily } from "@/server/jobs/queue";
import { NotFoundError } from "@/server/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const familyId = await getActiveFamilyId(user.id);
    if (!familyId) throw new NotFoundError("Job");
    const job = await getJobForFamily(id, familyId);
    if (!job) throw new NotFoundError("Job");
    return job;
  });
}
