# Evaluating the classifier

The model makes three judgements about each of the 42 incidents: a hazard
category, whether it is a psychosocial hazard, and whether the recorded severity
is inconsistent with the description. This is how we know whether to believe any
of them.

## What it is scored against

`src/ai/labels.ts` holds 42 hand-written labels, keyed on source incident ID and
date. They were written by reading the register, before the prompt existed — the
commit history shows the labels landing first, which is the only reason the
score means anything. A label written after seeing model output measures
agreement with a decision already made.

Criteria are in [`ai-labelling-rubric.md`](ai-labelling-rubric.md), grounded in
Queensland's *Managing the risk of psychosocial hazards at work Code of Practice
2022* rather than invented for this exercise.

## Why one score was not enough

The first run scored 100% on everything. That number is close to meaningless on
its own, because the prompt states the same taxonomy the rubric uses. A perfect
score is what you would expect from a model that can apply stated criteria
consistently, and it looks identical to a model that genuinely recognises a
psychosocial hazard. The evaluation could not tell the two apart.

So there is a second prompt. `no-criteria` withholds the category definitions,
the psychosocial criteria and the severity threshold, and asks for the same
three judgements unaided. Same model, same tool schema, same 42 incidents, same
labels. The tool still constrains the category to eight values — that cannot be
removed without making the runs incomparable — so this measures whether the
model can apply the criteria unaided, not whether it could invent the
vocabulary.

Both passes are stored. `incident_classification` and `severity_flag` carry a
`prompt_version`, and `src/domain/ai.ts` pins the API to `ACTIVE_PROMPT`, so an
ablation can sit in the same database as the results the dashboard serves.

```bash
npm run enrich   -- --prompt=no-criteria
npm run evaluate -- --prompt=no-criteria
```

## Results

| | criteria stated | criteria withheld |
|---|---|---|
| category accuracy | 42/42 · 100% | 42/42 · 100% |
| psychosocial recall | 4/4 · 100% | 4/4 · 100% |
| psychosocial precision | 4/4 · 100% | 4/4 · 100% |
| severity recall | 4/4 · 100% | 4/4 · 100% |
| severity precision | 4/4 · 100% | **4/9 · 44%** |

### The psychosocial finding survives the ablation

This is the result that matters. All four psychosocial hazards are found with no
false positives even when the prompt says nothing about what a psychosocial
hazard is. The headline claim — four hazards in the register, none coded as such
— is not an artifact of having handed the model the answer.

### The severity flagging does not

Without the threshold, the ablation raises nine flags instead of four:

```
criteria stated                 criteria withheld
  INC-2025-118   1 -> 4           INC-2025-118   1 -> 4
  INC-2025-127   1 -> 3           INC-2025-127   1 -> 3
  INC-2025-141   1 -> 4           INC-2025-141   1 -> 3
  INC-2026-109   1 -> 3           INC-2026-109   1 -> 2
                                  INC-2025-008   3 -> 2   ✗
                                  INC-2026-021   3 -> 2   ✗
                                  INC-2026-034   2 -> 1   ✗
                                  INC-2026-131   3 -> 2   ✗
                                  INC-2026-134   2 -> 3   ✗
```

Four of the five false positives point *downward*: the model arguing a severity
is overstated. That is not a worse version of the same job, it is a different
job. Under-recording harm is the compliance exposure; over-recording it is not,
and a report full of "this incident was rated too seriously" would be noise a
sustainability lead has to wade through.

The `with-criteria` prompt avoids this because its rule has a direction built
in — flag only where the recorded severity is 1 or 2 *and* the description names
treatment beyond first
aid or a persisting health effect. The ablation shows that constraint is doing
real work, not decorating the prompt.

The one upward false positive, INC-2026-134, is the fatigue report during the
substation outage. Arguably the label is the thing that is wrong there. It is
listed as an error because the label was fixed before the run, which is the
point of fixing it first.

### The confidence number turns out to be worth something

The `with-criteria` prompt produced no errors, so its confidence could not be
calibrated against anything. The ablation's errors make it measurable:

```
severity flag confidence when right   0.725  (n=4)
severity flag confidence when wrong   0.550  (n=5)
```

The confidence separates. Every false positive sits at 0.50–0.60; the two flags
it gets most confidently right sit at 0.85–0.90. On this evidence a threshold
around 0.7 would have recovered most of the lost precision, which means the
number is usable for routing rather than decoration.

The same evidence undercuts the recall figure slightly. INC-2026-109 is counted
as found by the ablation, but at 0.55 confidence suggesting 1 → 2 —
indistinguishable by confidence from the flags that are wrong. "4/4 recall" and
"found it for the right reasons" are not the same claim.

## What this evaluation still cannot tell you

- **Grounding is not correctness.** The substring check proves a quote was taken
  from the record rather than invented. It says nothing about whether the
  judgement drawn from that quote is right — a model can quote accurately and
  still classify wrongly. Fabrication is caught by the check; misreading is only
  caught by the labels, which is the next limitation.
- **n=4 on both interesting classes.** One disagreement moves recall by 25
  points. These are directional results, not measurements.
- **The category enum was never ablated,** so category accuracy across both runs
  says less than 100% twice suggests.
- **One model, one run, no repeats.** Nothing here separates a stable judgement
  from a lucky sample.
- **One labeller.** The rubric is written down and the disagreements are printed
  so a reader can audit them, but there is no second opinion and no inter-rater
  agreement.
- **The gold set is the whole register.** There is no held-out split, because 42
  incidents will not support one.
