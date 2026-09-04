import { NextResponse } from 'next/server';
import { requestPauseBatch } from '@/lib/batchEngine';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const batch = await requestPauseBatch(params.id);
    return NextResponse.json({
      success: true,
      message: `Batch ${params.id} paused and global kill-switch enabled.`,
      batch,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
