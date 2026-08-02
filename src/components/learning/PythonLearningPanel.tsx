import React, {useMemo, useState} from 'react';
import type {PythonExercise} from '@site/src/components/PythonPlayground';

type Phase = 'concept' | 'algorithm' | 'implementation' | 'production';

const conceptCatalog = [
  {pattern: /\bre\.|import re|regex/i, name: 'Regular expressions', why: 'Use when input has a stable grammar but variable text; fullmatch prevents silently accepting partial records.', alternative: 'split/partition for simple fixed delimiters; a real parser for complex grammars.'},
  {pattern: /dataclass/i, name: 'Dataclass / typed record', why: 'Names the domain fields and gives stable equality/repr behavior, making boundaries and tests clearer than anonymous tuples.', alternative: 'dict for flexible external data; NamedTuple for a lighter immutable record; class when behavior/invariants dominate.'},
  {pattern: /dict|\{.*:/is, name: 'Dictionary / hash map', why: 'Provides average O(1) lookup and explicit key-to-value meaning—useful for counts, indexes and normalized records.', alternative: 'list for ordered scans; set for membership only; dataclass for a fixed schema.'},
  {pattern: /\bset\b|set\(/i, name: 'Set', why: 'Expresses uniqueness and average O(1) membership without carrying an unused value.', alternative: 'dict when each key needs metadata; list when duplicates/order are required.'},
  {pattern: /heapq|heap/i, name: 'Heap / priority queue', why: 'Keeps the next smallest/largest item available without sorting the full dataset after every update.', alternative: 'sorted list for small static input; deque for FIFO; full sort for one final ordered result.'},
  {pattern: /deque|collections/i, name: 'Deque / collections', why: 'Supports efficient queue/window operations and specialized counters without manual bookkeeping.', alternative: 'list for append/pop at one end; heap for priority rather than arrival order.'},
  {pattern: /yield|generator/i, name: 'Generator', why: 'Streams one result at a time, bounding memory for logs, APIs and large inventories.', alternative: 'list when the dataset is small and repeated/random access is required.'},
  {pattern: /try:|except/i, name: 'Exception boundary', why: 'Turns a known failure class into an explicit operational result while letting unexpected bugs remain visible.', alternative: 'Pre-validation for expected invalid input; Result-style object when callers need typed failure categories.'},
  {pattern: /json|yaml/i, name: 'Serialization boundary', why: 'Converts untrusted external representation into validated internal data and isolates schema errors.', alternative: 'CSV for flat tabular input; dataclass/model validation after decoding.'},
  {pattern: /subprocess|returncode|stderr/i, name: 'Subprocess boundary', why: 'Treats command execution as fallible I/O with exit code, stdout, stderr, timeout and safe argument handling.', alternative: 'Native SDK/API when available; never interpolate untrusted input through shell=True.'},
  {pattern: /time\.|datetime|timestamp/i, name: 'Time model', why: 'Makes windows, deadlines and expiry explicit; monotonic time is required for elapsed-duration logic.', alternative: 'Wall-clock UTC for timestamps/audit; monotonic clock for retries, timeouts and token buckets.'},
  {pattern: /sorted|\.sort\(/i, name: 'Sorting', why: 'Provides deterministic ordering for ranking, retention and reproducible output.', alternative: 'heap/top-k when only a few extremes are needed; preserve input order when ranking adds no value.'},
];

function lineReason(line: string): string {
  const value = line.trim();
  if (!value) return 'Separates logical blocks for readability.';
  if (value.startsWith('import ' ) || value.startsWith('from ')) return 'Imports the smallest standard-library building block required by the algorithm.';
  if (value.startsWith('def ')) return 'Defines a testable pure boundary with explicit inputs and a returned result.';
  if (value.startsWith('class ') || value.startsWith('@dataclass')) return 'Defines the domain record or behavior contract instead of passing ambiguous raw values.';
  if (value.startsWith('if ') || value.startsWith('elif ')) return 'Branches on an explicit invariant or boundary condition.';
  if (value.startsWith('for ') || value.startsWith('while ')) return 'Processes the collection/window one item at a time; loop bounds determine complexity.';
  if (value.startsWith('try:') || value.startsWith('except ')) return 'Creates a controlled failure boundary for the named error class.';
  if (value.startsWith('raise ')) return 'Rejects invalid or ambiguous input early instead of producing unsafe partial output.';
  if (value.startsWith('return ')) return 'Returns the stable function contract consumed and asserted by callers/tests.';
  if (value.startsWith('yield ')) return 'Emits one result lazily so the caller controls iteration and memory use.';
  if (/append|add|update|\[.*\]\s*=/.test(value)) return 'Updates the chosen data structure with the current validated item.';
  return 'Implements one transformation or state update in the algorithm.';
}

export default function PythonLearningPanel({exercise}: {exercise: PythonExercise}) {
  const [phase, setPhase] = useState<Phase>('concept');
  const source = `${exercise.prompt}\n${exercise.starter}\n${exercise.solution}\n${exercise.explanation}`;
  const concepts = useMemo(() => conceptCatalog.filter((item) => item.pattern.test(source)), [exercise.id]);
  const solutionLines = exercise.solution.split('\n');
  const loopCount = (exercise.solution.match(/\b(for|while)\b/g) || []).length;
  const complexity = /sorted|\.sort\(/.test(exercise.solution) ? 'Usually O(n log n) time because all n items are sorted; storage depends on the result structure.' : loopCount > 1 ? 'Inspect loop nesting: independent loops are O(n); genuinely nested loops can become O(n²). Tests should include large input.' : loopCount === 1 ? 'Normally O(n) time for n input records. Additional memory is O(n) when a result collection is built, or O(1) when only counters/state are retained.' : 'Normally O(1) around the fixed operation, excluding library/I/O work; verify the called API’s own complexity.';
  const phases: {id: Phase; label: string}[] = [{id: 'concept', label: '1 · Concepts'}, {id: 'algorithm', label: '2 · Algorithm'}, {id: 'implementation', label: '3 · Full solution'}, {id: 'production', label: '4 · Production'}];

  return <section className="pythonLearningSystem">
    <header><div><span className="eyebrow">Python for production infrastructure</span><h3>Learn the design before coding</h3></div><span className="runtimeBadge">Teach → understand → implement → test</span></header>
    <nav className="incidentPhaseNav">{phases.map((item) => <button key={item.id} className={phase === item.id ? 'active' : 'secondary'} onClick={() => setPhase(item.id)}>{item.label}</button>)}</nav>

    {phase === 'concept' && <div className="studyPhaseBody"><div className="conceptLesson"><strong>Problem contract</strong><p>{exercise.prompt}</p><p><strong>Expected output:</strong> <code>{exercise.expected}</code></p></div><h4>Python components used and why</h4><div className="technologyDecisionGrid">{(concepts.length ? concepts : [{name: 'Functions and explicit data flow', why: 'A small function isolates the algorithm from input/output so behavior is easy to reason about and test.', alternative: 'A class is justified only when state, invariants or interchangeable behavior must persist across calls.'}]).map((item) => <article key={item.name}><h5>{item.name}</h5><dl><dt>Why use it</dt><dd>{item.why}</dd><dt>Alternative</dt><dd>{item.alternative}</dd></dl></article>)}</div><div className="retainBox"><strong>Selection rule</strong><p>Choose the simplest structure that expresses the required invariant. Do not use OOP, regex, concurrency or a third-party package merely to make the program look advanced.</p></div></div>}

    {phase === 'algorithm' && <div className="studyPhaseBody"><h4>Algorithm flow</h4><div className="componentBoundaryDiagram">{['Receive input', 'Validate contract', 'Normalize / classify', 'Transform / aggregate', 'Return deterministic result', 'Verify with tests'].map((item, index) => <React.Fragment key={item}><article><span>{index + 1}</span><strong>{item}</strong></article>{index < 5 && <b>→</b>}</React.Fragment>)}</div><h4>Pseudocode derived from the contract</h4><pre className="algorithmBlock">{`INPUT: values described by the function signature\n1. Reject invalid or ambiguous input at the boundary.\n2. Create the smallest state/data structure needed for the result.\n3. Process each relevant item once where possible.\n4. Apply the rule: ${exercise.hint}\n5. Return the exact documented output type.\n6. Verify normal, empty, boundary and invalid cases.`}</pre><div className="twoColumns"><section><h4>Data-structure question</h4><p>What lookup, ordering, uniqueness or streaming property does the algorithm require? Select list, dict, set, deque, heap or generator from that property.</p></section><section><h4>Complexity</h4><p>{complexity}</p></section></div></div>}

    {phase === 'implementation' && <div className="studyPhaseBody"><h4>Complete runnable reference solution</h4><pre className="fullSolutionCode"><code>{exercise.solution}</code></pre><h4>Line-by-line reasoning</h4><div className="lineByLine">{solutionLines.map((line, index) => <article key={`${index}-${line}`}><code>{String(index + 1).padStart(2, '0')} · {line || ' '}</code><p>{lineReason(line)}</p></article>)}</div><h4>Contract tests</h4><pre className="algorithmBlock"><code>{exercise.tests}</code></pre><div className="learningCallout"><strong>Do not memorize the code</strong><p>Retain the boundary, algorithm, data-structure reason and failure behavior. You should be able to recreate an equivalent implementation with different variable names.</p></div></div>}

    {phase === 'production' && <div className="studyPhaseBody"><div className="conceptLesson"><strong>Why this matters in production</strong><p>{exercise.explanation}</p></div><div className="flowQuestions"><article><strong>Input safety</strong><p>Validate schema, bounds, encoding and ambiguous records. Include the source/correlation ID in errors without leaking secrets.</p></article><article><strong>I/O boundary</strong><p>Keep file, API, subprocess and database I/O outside the pure transformation where possible; add deadlines and bounded retries.</p></article><article><strong>Observability</strong><p>Use structured logs, operation/result counters, duration and failure classification. Avoid high-cardinality raw identifiers in metrics.</p></article><article><strong>Release safety</strong><p>Dry-run mutations, make repeated execution idempotent, checkpoint partial progress and define rollback before changing infrastructure.</p></article></div><h4>Production hardening checklist</h4><div className="ruleGrid">{['Type and schema validation', 'Timeout/deadline for every I/O', 'Retry only transient idempotent work', 'Structured logging and exit codes', 'Unit + boundary + failure tests', 'Least privilege and secret redaction', 'Dry-run/idempotency for mutations', 'Packaging, versioning and ownership'].map((item) => <article key={item}>{item}</article>)}</div></div>}
  </section>;
}
