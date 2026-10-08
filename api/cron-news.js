// /api/cron-news.js
// 평일 아침 8시(한국시간)에 Vercel Cron이 호출 -> 후보 기사를 가져와 Supabase(news_candidates)에 저장합니다.
// (스케줄은 vercel.json 참고. 공개용 Supabase 키는 index.html에 이미 있는 것과 동일합니다.)
const { fetchCandidates } = require("./_news");

const SUPABASE_URL = "https://wxsscpjafyszvtdkzrgv.supabase.co";
const SUPABASE_KEY = "sb_publishable_gkQJVz2h0mvwR50OpgobRA_-ufWbsOT";

function todayKST() {
  // 한국시간 기준 오늘 날짜 (YYYY-MM-DD)
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  // CRON_SECRET 환경변수를 설정해 둔 경우에만 Vercel Cron 호출인지 확인
  if (process.env.CRON_SECRET && req.headers.authorization !== "Bearer " + process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    const items = await fetchCandidates();
    if (!items.length) {
      return res.status(502).json({ ok: false, error: "가져온 기사가 없어요 (구글뉴스 응답 확인 필요)" });
    }
    const row = { fetch_date: todayKST(), items: items, fetched_at: new Date().toISOString() };
    const resp = await fetch(SUPABASE_URL + "/rest/v1/news_candidates?on_conflict=fetch_date", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(row)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(500).json({ ok: false, error: "Supabase 저장 실패: " + resp.status + " " + text });
    }
    res.status(200).json({ ok: true, count: items.length, fetchDate: row.fetch_date });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
};
