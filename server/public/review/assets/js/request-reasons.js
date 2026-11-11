const coachReasons = [
  "Reason pending",
  "Technical points",
  "Punch misidentification",
  "Head Kick (no head PSS)",
  "Invalidation of gam-jeom and points reinstated",
  "Restoring points scored before a gam-jeom",
  "Gam-jeom given to the wrong player",
  "Gam-jeom for the opponent",
  "Invalidation of opponent's technical points",
  "Invalidation of opponent's points following a gam-jeom",
  "Other",
];
const refereeReasons = [
  "Head kick after count",
  "Pretending injury",
  "Judge request technical",
  "Last action in the last 5 seconds",
];
const technicalReasons = [
  "Reason pending", "PSS test", "Phantom points", "Time", "Scoreboard entry",
];
export const opponentGamJeomReasons = [
  "Falling down",
  "Crossing the boundary line",
  "Attacking after kal-yeo",
  "Attacking the fallen opponent",
];
export function reasonOptions(origin, issueType) {
  return [...(issueType === "technical" ? technicalReasons
    : origin === "referee" ? refereeReasons : coachReasons)];
}
export function requestReason({ origin, issueType, reason, reasonOther, gamJeomReason }) {
  if (!reasonOptions(origin, issueType).includes(reason))
    throw new Error("Select a reason for this origin and issue type.");
  if (reason === "Other") {
    const detail = String(reasonOther || "").trim();
    if (!detail) throw new Error("Enter details for Other.");
    return `Other: ${detail}`;
  }
  if (reason === "Gam-jeom for the opponent") {
    if (!opponentGamJeomReasons.includes(gamJeomReason))
      throw new Error("Select the opponent's Gam-jeom reason.");
    return `${reason}: ${gamJeomReason}`;
  }
  return reason;
}

function setOptions(select, values) {
  const previous = select.value;
  select.replaceChildren(...values.map(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    return option;
  }));
  select.value = values.includes(previous) ? previous : values[0];
}
function updateReasonDetails(prefix) {
  const reason = document.getElementById(`${prefix}Reason`).value;
  for (const [fieldId, groupId, visible] of [
    [`${prefix}ReasonOther`, `${prefix}ReasonOtherGroup`, reason === "Other"],
    [`${prefix}GamJeomReason`, `${prefix}GamJeomGroup`, reason === "Gam-jeom for the opponent"],
  ]) {
    const field = document.getElementById(fieldId);
    document.getElementById(groupId).classList.toggle("d-none", !visible);
    field.disabled = !visible;
    field.required = visible;
    if (!visible) field.value = field.tagName === "SELECT" ? opponentGamJeomReasons[0] : "";
  }
}
export function updateRequestReasonDetails() { updateReasonDetails("request"); }
export function updateAnnotationReasonDetails() { updateReasonDetails("annotation"); }
export function updateRequestReasons() {
  setOptions(document.getElementById("requestReason"), reasonOptions(
    document.getElementById("requestOrigin").value,
    document.getElementById("requestIssueType").value,
  ));
  setOptions(document.getElementById("requestGamJeomReason"), opponentGamJeomReasons);
  updateRequestReasonDetails();
}

export function parseReason(value) {
  for (const reason of ["Other", "Gam-jeom for the opponent"]) {
    if (value.startsWith(`${reason}: `)) {
      return { reason, detail: value.slice(reason.length + 2) };
    }
  }
  return { reason: value, detail: "" };
}
export function fillAnnotationReasons(review) {
  const saved = review.annotation?.reason || review.reason || review.issues?.[0] || "Reason pending";
  const parsed = parseReason(saved);
  const options = reasonOptions(review.origin, review.issueType);
  // Retain historical reasons that are not in the current lists.
  const reason = options.includes(parsed.reason) ? parsed.reason : saved;
  if (!options.includes(reason)) options.push(reason);
  const select = document.getElementById("annotationReason");
  setOptions(select, options);
  select.value = reason;
  setOptions(document.getElementById("annotationGamJeomReason"), opponentGamJeomReasons);
  document.getElementById("annotationReasonOther").value = reason === "Other" ? parsed.detail : "";
  const gamJeom = parsed.detail || review.annotation?.gamJeomType;
  if (opponentGamJeomReasons.includes(gamJeom))
    document.getElementById("annotationGamJeomReason").value = gamJeom;
  updateAnnotationReasonDetails();
}
export function annotationReason(review, fields) {
  const saved = review.annotation?.reason || review.reason || review.issues?.[0] || "Reason pending";
  if (fields.reason === saved && !reasonOptions(review.origin, review.issueType).includes(fields.reason))
    return saved;
  return requestReason({ ...fields, origin: review.origin, issueType: review.issueType });
}
