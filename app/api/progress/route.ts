import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';
import { getProgressStore } from '@/lib/onboarding/state';
import { progressView } from '@/lib/onboarding/steps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const lab = new URL(req.url).searchParams.get('lab') ?? DEFAULT_LAB;
  if (!LAB_ID.test(lab)) return Response.json({ error: 'Laboratorio inválido.' }, { status: 400 });
  return Response.json(progressView(await getProgressStore().load(lab)));
}
