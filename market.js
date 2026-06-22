// GALLOP serverless proxy — keeps the API key server-side, adds exact S&P 500,
// and lets Netlify's CDN cache responses (one upstream call serves all users).
// Requires env var FINNHUB_KEY (Netlify → Site settings → Environment variables).
exports.handler = async function (event) {
  var p = event.queryStringParameters || {};
  var KEY = process.env.FINNHUB_KEY || '';
  var FH = 'https://finnhub.io/api/v1/';
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=30'
  };
  function ok(obj) { return { statusCode: 200, headers: headers, body: JSON.stringify(obj) }; }

  try {
    var type = p.type;

    if (type === 'quote') {
      var d = await (await fetch(FH + 'quote?symbol=' + encodeURIComponent(p.symbol || '') + '&token=' + KEY)).json();
      return ok({ c: d.c, dp: d.dp });
    }

    if (type === 'profile') {
      var pr = await (await fetch(FH + 'stock/profile2?symbol=' + encodeURIComponent(p.symbol || '') + '&token=' + KEY)).json();
      return ok({ logo: pr && pr.logo ? pr.logo : '' });
    }

    if (type === 'news') {
      var n = await (await fetch(FH + 'news?category=general&token=' + KEY)).json();
      return ok((n || []).slice(0, 12));
    }

    if (type === 'sp500') {
      // Exact S&P 500 index via Yahoo (no CORS server-side); fall back to SPY × 10.
      try {
        var y = await (await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
        var r = y.chart.result[0];
        var price = r.meta.regularMarketPrice;
        var prev = r.meta.chartPreviousClose || r.meta.previousClose;
        return ok({ price: price, changePct: prev ? ((price - prev) / prev) * 100 : null });
      } catch (e) {
        var s = await (await fetch(FH + 'quote?symbol=SPY&token=' + KEY)).json();
        return ok({ price: s.c * 10, changePct: s.dp });
      }
    }

    if (type === 'raw') {
      // Generic Finnhub passthrough (used by the research page). Restricted to Finnhub paths.
      var ep = p.ep || '';
      if (ep.charAt(0) !== '/') return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'bad endpoint' }) };
      var sep = ep.indexOf('?') >= 0 ? '&' : '?';
      var rr = await (await fetch('https://finnhub.io/api/v1' + ep + sep + 'token=' + KEY)).json();
      return ok(rr);
    }

    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'unknown type' }) };
  } catch (e) {
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: String(e && e.message) }) };
  }
};
