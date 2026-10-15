import { redirect } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import { DEFAULT_LAB, normalizeLab } from '@/lib/onboarding/lab';

export default async function Page({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const { lab: raw = DEFAULT_LAB } = await searchParams;
  const lab = normalizeLab(raw);
  if (!lab) {
    return <main className="p-8 text-sm">Laboratorio inválido: el link tiene que terminar en ?lab= seguido de un nombre, por ejemplo ?lab=prueba-juan.</main>;
  }
  // "prueba-Nanni" y "prueba-nanni" son el mismo laboratorio: llevamos siempre al link normalizado.
  if (lab !== raw) redirect(`/?lab=${lab}`);
  return <Chat lab={lab} />;
}
