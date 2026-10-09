const base = "/review/api";

async function request(path, options = {}) {
  const response = await fetch(`${base}/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(
      `${path} returned an invalid response (${response.status}). Check the PHP server log.`,
    );
  }
  if (!response.ok || !payload.ok)
    throw new Error(payload.error?.message || "Prototype API request failed.");
  return payload;
}

export const mockServer = {
  async bootstrap(ring) {
    const [match, pssel, reviews] = await Promise.all([
      request(`match.php?ring=${encodeURIComponent(ring)}`),
      request(`pssel.php?ring=${encodeURIComponent(ring)}`),
      request(`review.php?ring=${encodeURIComponent(ring)}`),
    ]);
    return {
      match: match.data,
      scenarios: match.scenarios,
      psselEvents: pssel.data.events,
      reviews: reviews.data.reviews,
      workflow: reviews.data.workflow,
    };
  },
  review(action, body = {}) {
    return request("review.php", {
      method: "POST",
      body: JSON.stringify({ action, ...body }),
    });
  },
  createRequest(body) {
    return this.review("create-request", body);
  },
  selectReview(body) {
    return this.review("select", body);
  },
  startReview(body) {
    return this.review("start", body);
  },
  markAur(body) {
    return this.review("mark-aur", body);
  },
  resolveWithoutReview(body) {
    return this.review("resolve-without-review", body);
  },
  deleteRequest(body) {
    return this.review("delete-request", body);
  },
  setResult(body) {
    return this.review("set-result", body);
  },
  annotate(body) {
    return this.review("annotate", body);
  },
  saveMatch(body) {
    return request("match.php", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  reset(body = {}) {
    return this.review("reset", body);
  },
};
