const base = '/review/api';

async function request(path, options = {}) {
  const response = await fetch(`${base}/${path}`, {headers: {'Content-Type': 'application/json'}, ...options});
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'Prototype API request failed.');
  return payload;
}

export const mockServer = {
  async bootstrap(ring) {
    const [match, pssel, reviews] = await Promise.all([
      request(`match.php?ring=${encodeURIComponent(ring)}`),
      request(`pssel.php?ring=${encodeURIComponent(ring)}`),
      request('review.php')
    ]);
    return {match: match.data, scenarios: match.scenarios, psselEvents: pssel.data.events, reviews: reviews.data.reviews};
  },
  review(action, body = {}) { return request('review.php', {method: 'POST', body: JSON.stringify({action, ...body})}); },
  createRequest(body) { return this.review('create-request', body); },
  startReview(body) { return this.review('start', body); },
  markAur(body) { return this.review('mark-aur', body); },
  resolveWithoutReview(body) { return this.review('resolve-without-review', body); },
  setResult(body) { return this.review('set-result', body); },
  annotate(body) { return this.review('annotate', body); },
  reset() { return this.review('reset'); }
};
