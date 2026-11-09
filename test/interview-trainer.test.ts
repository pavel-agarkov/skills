import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// These are static instruction/packaging contracts, not trainer execution tests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n');
const skill = read('dist/skills/interview-trainer/SKILL.md');
const readme = read('dist/skills/interview-trainer/README.md');
const cli = read('dist/skills/interview-trainer/references/cli.md');
const storage = read('dist/skills/interview-trainer/references/storage.md');
const preparation = read('dist/skills/interview-trainer/references/preparation.md');
const sources = read('dist/skills/interview-trainer/references/sources.md');
const grading = read('dist/skills/interview-trainer/references/grading.md');
const questions = read('dist/skills/interview-trainer/references/questions.md');
const sessions = read('dist/skills/interview-trainer/references/sessions.md');

const contract = (name: string, fn: () => void) => test(`static instruction contract: ${name}`, fn);

function fencedExampleAfter(text: string, heading: string) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const match = text.slice(start).match(/```markdown\n([\s\S]*?)\n```/);
  assert.ok(match, `missing markdown example after: ${heading}`);
  return match[1];
}

contract('usage, hints, and prepare routing stay synchronized', () => {
  const hint = skill.match(/^argument-hint: "([^"]+)"$/m)?.[1];
  assert.ok(hint, 'missing canonical argument-hint');
  assert.equal(
    hint,
    '<configure|start|resume|abandon|stats|prepare|topics {list|add <topic>|remove <topic>|update <topic>}> [--improve]',
  );
  assert.ok(skill.includes(`Usage: /interview-trainer ${hint}`), 'bare-help usage must match the argument hint');
  assert.match(skill, /\| `--improve` \| any complete command \|/);
  assert.match(skill, /A clear request to prepare or top up the reusable question pool routes to `prepare`/);
  assert.match(cli, /\| `prepare` \| Prepare or top up a reusable pool of verified questions without starting a session\./);
  assert.match(cli, /`prepare` accepts no positional arguments/);
  assert.match(cli, /`--improve` is global/);
  assert.match(cli, /Do not add command-specific flags/);
});

contract('new preparation reference is reachable from command routing', () => {
  assert.match(skill, /Read `references\/preparation\.md` for `prepare`/);
  assert.match(cli, /\| `prepare` \|[^|]*\| `preparation\.md`, `storage\.md`/);
  assert.match(readme, /preparation documentation does not include their question, answer, source-support notes, or rubric content/);
  assert.ok(existsSync(join(root, 'dist/skills/interview-trainer/references/preparation.md')));
});

contract('global improvement mode follows the invoked workflow', () => {
  assert.match(skill, /Recognize it only in the skill invocation, never in quiz-answer text/);
  assert.match(skill, /For `start` and `resume`, persist `improveAfterSession: true`/);
  assert.match(skill, /For immediate commands, propose after the command completes/);
  assert.match(cli, /`--improve` is global: for `prepare`, make any supported proposal after preparation completes; it does not start a session or change `improveAfterSession`/);
  assert.match(preparation, /For `prepare --improve`, complete the preparation first/);
  assert.match(preparation, /Do not set `improveAfterSession` or edit the skill/);
  assert.match(preparation, /`start --improve` instead follows the start command's existing after-session proposal behavior/);
});

contract('pool index and candidate records have independent schema versions and complete fields', () => {
  assert.match(storage, /schemaVersion: 3/);
  assert.match(storage, /`schemaVersion` in the index and `recordSchemaVersion` in each question body are independent/);

  const index = fencedExampleAfter(storage, '### `.training/pool/index.md`');
  assert.match(index, /schemaVersion: 1/);
  assert.match(index, /operationStatus: ready \| partial/);
  assert.match(index, /questionId \| path \| status/);

  const candidate = fencedExampleAfter(storage, '### `.training/pool/questions/<questionId>.md`');
  for (const field of [
    'recordSchemaVersion:', 'questionId:', 'status: ready', 'topic:', 'subtopic:',
    'language:', 'level:', 'format:', 'conceptId:', 'angleId:', 'productVersion:',
    'text:', 'choices:', 'rubric:', 'sourceId:', 'sourceTitle:', 'sourceUrl:',
    'verifiedAt:', 'sourceVersion:', '## Criterion Support',
  ]) {
    assert.ok(candidate.includes(field), `complete candidate example missing ${field}`);
  }
  assert.match(storage, /Each record has a stable `questionId` independent of session identity/);
  assert.match(preparation, /must contain:[\s\S]*?complete private rubric/);
});

contract('schema examples and rubric shape preserve quarter-point scoring', () => {
  const candidate = fencedExampleAfter(storage, '### `.training/pool/questions/<questionId>.md`');
  assert.match(candidate, /rubric: threshold=0\.25; allocation-kind=0\.25; collection-impact=0\.25; implication=0\.25/);
  assert.match(preparation, /criteria totaling `1` with each weight a multiple of `0\.25`/);
  assert.match(grading, /Results are `0`, `0\.25`, `0\.5`, `0\.75`, or `1`/);
  assert.match(storage, /Each weight must be a multiple of `0\.25`/);
  assert.match(storage, /For single-choice, `choices` contains the labeled choices exactly as shown and `rubric` contains only `correct=B; reason=/);
});

contract('partial candidates are excluded and absence differs from malformed present state', () => {
  const partial = fencedExampleAfter(storage, 'The complete example is eligible only');
  assert.match(partial, /status: partial/);
  assert.match(partial, /missing: \[language, level, rubric, sourceUrl, criterionSupport\]/);
  assert.match(storage, /a `ready` index row pointing to a partial body/);
  assert.match(storage, /A missing referenced record/);
  assert.match(storage, /is corruption: stop using the affected state[\s\S]*?ask one explicit recovery question/);
  assert.match(storage, /An absent pool or presentation ledger is normal legacy state/);
  assert.match(storage, /A present but malformed pending section or presentation marker requires explicit recovery/);
  assert.match(storage, /unsupported version/);
});

contract('no-pool fallback preserves the on-demand path and privacy boundaries', () => {
  assert.match(sessions, /If no usable candidate exists, persist the pending start and ask one generic choice/);
  assert.match(sessions, /Decline skips pool creation, stale-pool bulk revalidation, and batch research, and follows the original per-question path/);
  assert.match(sessions, /If it yields none, report that no usable material was prepared and ask whether to proceed on demand, retry preparation, or cancel/);
  assert.match(questions, /In `on-demand` mode, including a declined start and a legacy active session, use only the established on-demand path/);
  assert.match(preparation, /Preparation does not create or initialize a session, append to or read a transcript, grade an answer/);
  assert.match(preparation, /Workers must not ask the learner questions, grade answers, read transcripts or archives/);
  assert.match(storage, /The ledger contains identity and presentation metadata only—no question text, answers, scores, or rubric/);
  assert.match(sources, /Never cache claims, answers, rubrics, templates, user answers, or scores in source files/);
  assert.match(skill, /Never expose the private rubric before grading/);
});

contract('recovery and lifecycle rules preserve pending work and presentation identity', () => {
  assert.match(preparation, /An interrupted operation resumes from its saved operation, target, improvement intent, and return action/);
  assert.match(sessions, /On `resume`, honor any persisted pending operation before ordinary scheduling/);
  assert.match(storage, /A present incomplete\/malformed operation is not treated as absent: ask for explicit recovery/);
  assert.match(storage, /If the marker is `committed`, the current question is `awaiting-answer`[\s\S]*?do not append, present, count, or retire it again/);
  assert.match(storage, /If staged state or ledger linkage is incomplete or inconsistent[\s\S]*?ask one recovery question/);
  assert.match(questions, /Retirement occurs on presentation, not grading/);
  assert.match(sessions, /unused pool records and index, and the complete presentation-identity ledger/);
  assert.match(storage, /Session completion and abandonment do not prune the optional pool or presentation ledger/);
  assert.match(storage, /Never scan transcripts or archives to reconstruct candidate identities/);
});

contract('presentation recovery, worker bounds, and candidate freshness are explicit', () => {
  assert.match(storage, /If the marker is `committed`, the current question is `awaiting-answer`[\s\S]*?do not append, present, count, or retire it again/);
  assert.match(storage, /If staged state or ledger linkage is incomplete or inconsistent[\s\S]*?ask one recovery question/);
  assert.match(storage, /Never scan transcripts or archives to reconstruct candidate identities/);
  assert.match(preparation, /twice the requested target per invocation/);
  assert.match(preparation, /no more than \*\*three independent topic-batch workers\*\*/);
  assert.match(preparation, /Workers must not ask the learner questions, grade answers, read transcripts or archives/);
  assert.match(sources, /A fresh URL or refreshed source metadata proves neither the claims in a question nor support for its rubric/);
  assert.match(sources, /Revalidate regardless of age for current\/latest behavior/);
  assert.match(preparation, /180-day stable-foundational \/ 30-day version-sensitive freshness/);
});
