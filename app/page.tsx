import { Chat } from '@/components/chat/chat';
import { DEFAULT_LAB, LAB_ID } from '@/lib/onboarding/lab';

export default async function Page({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const { lab = DEFAULT_LAB } = await searchParams;
  if (!LAB_ID.test(lab)) {
    return <main className="p-8 text-sm">Laboratorio inválido: usá solo minúsculas, números y guiones.</main>;
  }
  return <Chat lab={lab} />;
}
