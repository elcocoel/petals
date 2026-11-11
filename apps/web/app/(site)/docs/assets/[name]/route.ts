import { docAsset, docAssetNames } from '../../../../../components/docs/content.ts';

export const dynamic = 'force-static';
export const dynamicParams = false;
export function generateStaticParams() {
  return docAssetNames().map((name) => ({ name }));
}
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const bytes = docAsset(name);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': name.endsWith('.webp') ? 'image/webp' : 'image/png',
      'x-content-type-options': 'nosniff',
    },
  });
}
