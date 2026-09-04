import { NextResponse } from 'next/server';
import { resumeBatch } from '@/lib/batchEngine';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const batch = await resumeBatch(params.id);
    return NextResponse.json({
      success: true,
      message: `Batch ${params.id} resumed and global kill-switch disabled.`,
      batch,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
