import { notFound } from 'next/navigation';
import { workspaceContext } from '@/lib/access';
import { workspaceData } from '@/lib/data';
import { moduleFor } from '@/lib/modules';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function WorkspacePage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const key = section?.join('/') || '';
  if (!moduleFor(key)) notFound();
  const ctx = await workspaceContext();
  const data = await workspaceData(ctx);
  return <Workspace context={ctx} data={data} moduleKey={key}/>;
}
