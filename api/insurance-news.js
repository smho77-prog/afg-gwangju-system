// /api/insurance-news.js
// 화면의 "오늘의 후보 기사 가져오기" 버튼이 호출합니다. (수집 로직은 _news.js 공용)
const { fetchCandidates } = require("./_news");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  try {
    const limited = await fetchCandidates();
    res.status(200).json({ ok: true, count: limited.length, items: limited, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
};
