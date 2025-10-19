import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const localPath = searchParams.get('path');
  if (!localPath) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), localPath);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const stream = fs.createReadStream(filePath);
  return new NextResponse(stream as never, {
    headers: {
      'Content-Disposition': `attachment; filename="${path.basename(localPath)}"`
    }
  });
}
