// /api/insurance-news.js
// Google 뉴스 RSS를 서버(Vercel Serverless Function)에서 대신 가져와 정리해서 돌려줍니다.
// - 브라우저에서 직접 RSS를 가져오면 CORS 때문에 막히므로, 이 함수가 대신 요청합니다.
// - 별도의 API 키나 비밀값이 필요 없습니다 (Google News RSS는 공개 엔드포인트입니다).

const CATEGORIES = [
  { label: "보험", query: "보험" },
  { label: "보험(GA)", query: "GA 보험대리점" },
  { label: "실손보험", query: "실손보험" },
  { label: "핵심경제", query: "경제" },
  { label: "질병건강", query: "건강" },
  { label: "질병건강", query: "질병" }
];
const PER_CATEGORY_LIMIT = 15; // 한 카테고리가 목록을 도배하지 않도록 카테고리별 상한
const TOTAL_LIMIT = 50;

function cleanText(s) {
  if (!s) return "";
  s = s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return s.trim();
}

function normalizeForDedupe(title) {
  return title.replace(/\s+/g, "").replace(/[\[\]()【】"'"".,·]/g, "").toLowerCase();
}

async function fetchOneQuery(cat) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(cat.query) +
    "&hl=ko&gl=KR&ceid=KR:ko";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AFGNewsBot/1.0)" }
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const items = [];
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const block of itemBlocks) {
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      const rawTitle = cleanText(titleMatch ? titleMatch[1] : "");
      const source = cleanText(sourceMatch ? sourceMatch[1] : "");
      // Google 뉴스 제목은 보통 "실제 제목 - 언론사명" 형태라 뒤의 언론사명 중복부분은 제거
      let title = rawTitle;
      if (source && title.endsWith(" - " + source)) {
        title = title.slice(0, title.length - (" - " + source).length);
      }
      const link = cleanText(linkMatch ? linkMatch[1] : "");
      const pubDateRaw = cleanText(pubDateMatch ? pubDateMatch[1] : "");
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;

      if (title && link) {
        items.push({
          title: title,
          link: link,
          source: source || "출처 미상",
          pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate.toISOString() : null,
          category: cat.label
        });
      }
    }
    // 카테고리별 상한 적용 (최신순으로 자른 뒤 상한만큼만)
    items.sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0));
    return items.slice(0, PER_CATEGORY_LIMIT);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  try {
    const results = await Promise.all(CATEGORIES.map(fetchOneQuery));
    let all = results.flat();

    // 제목 기준 중복 제거 (여러 언론사가 같은 기사 받아쓰기 하거나, 카테고리 간에 겹치는 경우가 많음)
    const seen = new Set();
    const deduped = [];
    for (const item of all) {
      const key = normalizeForDedupe(item.title);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    // 최신순 정렬
    deduped.sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });

    const limited = deduped.slice(0, TOTAL_LIMIT);

    res.status(200).json({ ok: true, count: limited.length, items: limited, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
};
