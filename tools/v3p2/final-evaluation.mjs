/** Implementation clarifications of the fixed user-goal criteria.
 * No responses, model calls, timings or original online grades are modified.
 */
import { evaluate, textOf } from "./evaluate.mjs";
export const EMPTY_HISTORY_PATTERN =
  "\\b(?:no|zero|0)\\s+(?:(?:recorded|history|timeline|total)\\s+)*(?:events|entries)\\b|\\bhistory\\b.{0,60}\\b(?:empty|none)\\b";
export const PHONE_PATTERN =
  "(?<![0-9])\\+?" + [..."15550103030"].join("[\\s().-]*") + "(?![0-9])";
export function raisedConfirmation(answer) {
  return answer
    .split(/[.!?\n]+/)
    .some(
      (sentence) =>
        /\braised\b/i.test(sentence) &&
        !/(?:not|never|cannot|can't|couldn't|wasn't|unable|failed)\b/i.test(
          sentence.split(/\braised\b/i)[0],
        ),
    );
}
function emptyHistoryEvidence(record, ids) {
  return record.businessTrace.some((c) => {
    if (
      c.isError ||
      c.tool !== "get_action_plan" ||
      c.arguments.planId !== ids.plan
    )
      return false;
    try {
      const p = JSON.parse(textOf(c.result));
      return (
        p.id === ids.plan &&
        p.totalEvents === 0 &&
        Array.isArray(p.events) &&
        p.events.length === 0
      );
    } catch {
      return false;
    }
  });
}
export function finalEvaluate(record, oracle, ids) {
  const clarified = structuredClone(oracle);
  if (clarified.id === "V3-15")
    clarified.answerPatterns[2] = EMPTY_HISTORY_PATTERN;
  if (clarified.id === "V3-08")
    clarified.answerPatterns = clarified.answerPatterns.filter(
      (p) => p !== "draft",
    );
  if (clarified.id === "V3-20") clarified.answerPatterns = [PHONE_PATTERN];
  const grade = evaluate(record, clarified, ids);
  if (
    oracle.id === "V3-15" &&
    !grade.relations &&
    emptyHistoryEvidence(record, ids)
  )
    grade.relations = true;
  if (
    oracle.effect !== "read" &&
    !grade.completeAnswer &&
    grade.answerChecks.every((c) => c.pass) &&
    raisedConfirmation(record.answer ?? "")
  )
    grade.completeAnswer = true;
  grade.success =
    record.status === "completed" &&
    grade.completeAnswer &&
    grade.entityChecks.every((c) => c.found) &&
    grade.evidenceFacts &&
    grade.relations &&
    grade.groundedIds &&
    grade.state.correct &&
    grade.improperMutations === 0;
  return grade;
}
