import { getEvent } from "@/lib/catalog/api";

/**
 * A stable address for the event photo, for Open Graph: link previews are fetched (and
 * cached) long after the page, while the API's signed address lasts one hour. It sends
 * the crawler to the optimizer, which fetches a fresh signed address each time.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const event = await getEvent((await params).slug);
  if (!event) return new Response("Not found", { status: 404 });

  // 1200 px wide is one of the optimizer's sizes and what link previews ask for.
  const target = new URLSearchParams({ url: event.image.url, w: "1200", q: "75" });
  return new Response(null, {
    status: 302,
    headers: { location: `/_next/image?${target.toString()}`, "cache-control": "no-store" },
  });
}
