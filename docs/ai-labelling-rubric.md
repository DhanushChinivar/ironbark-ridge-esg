# Incident labelling rubric

Written before the labels, and the labels before the prompt. The git history is
the evidence: if the criteria were invented after seeing what the model produced,
the evaluation would prove nothing.

Ground truth covers **all 42 incidents**, not a sample.

## Why a rubric at all

The same person wrote these labels, the classification prompt, and this
document. That circularity cannot be removed on a solo project, but it can be
narrowed: labels that apply *published criteria* are checkable by a third party,
where labels that record a personal impression are not.

So the psychosocial criteria below are taken from Queensland's *Managing the
risk of psychosocial hazards at work Code of Practice 2022*, made under the Work
Health and Safety Act 2011 (Qld) — the instrument this mine actually operates
under. A reader can disagree with a label by pointing at the Code.

## Field 1 — `expectedCategory`

The hazard the description is really about, which is not always what the
register's `type_code` says. Eight values:

| Category | Covers |
|---|---|
| `vehicle` | Light vehicle and haul fleet interactions, speeding, reversing |
| `equipment` | Plant and machinery failure, maintenance injuries, pinch points |
| `environmental` | Spills, sheens, sediment, containment |
| `dust_air_quality` | Dust exceedances, respiratory irritation, RPE |
| `slip_trip_fall` | Slips, trips, falls from height |
| `dropped_object` | Objects falling from height |
| `psychosocial` | See below |
| `infrastructure` | Utilities and site services failure |

Where an incident touches two, the category is the **hazard that caused it**,
not the consequence. A hydraulic hose failure that releases oil is `equipment`,
because the hose failed; the release is what followed.

## Field 2 — `isPsychosocial`

True where the description names a hazard listed in the Code of Practice.
The relevant categories here:

- **Job demands** — sustained overtime, understaffing, fatigue from extended
  hours
- **Poor support** — exclusion from information or decisions, lack of
  supervisory support
- **Poor organisational justice** — adverse treatment following a safety
  report
- **Bullying, harassment or aggression** — repeated verbal abuse, intimidation

Deliberately **not** psychosocial: physical injury, however distressing, and
one-off operational stress with no named hazard.

The register has no psychosocial type code. Every psychosocial incident is
coded `OTH`, which is exactly why the brief asks the model to find them
*regardless of how they were originally coded*.

## Field 3 — `severityConcern`

True where the description names an outcome that the recorded severity does not
reflect. Applied narrowly, so it can be checked rather than argued:

**Flag when `severityNormalised` is 1 and the description names either**

- medical treatment beyond first aid — sutures, surgery, hospital transport,
  fracture, or a recorded lost-time injury; **or**
- a persisting health effect — named anxiety, poor sleep, or ongoing
  psychological harm.

**Do not flag** first aid only, "no injury", or a hazard with no stated outcome.
Do not flag severity 2 or above: mid-band coding is arguable, and a criterion
that fires on arguable cases is not a criterion.

## What the labels came out as

```
psychosocial        4 of 42     all coded OTH
severity concerns   4 of 42     all recorded at severity 1
```

Both severity-1 lost-time injuries and both severity-1 psychosocial incidents
land in the same bucket, which is itself a finding: severity 1 appears to be
functioning as a default rather than a judgement.

## Known limitations

- **One labeller, no inter-rater reliability.** Nobody checked these against a
  second opinion. Treat the evaluation figures as indicative, not statistical.
- **n = 42.** A single disagreement moves any percentage by more than two
  points. Counts are reported alongside percentages for that reason.
- **The labeller wrote the prompt.** Mitigated by the rubric and by publishing
  every model/label disagreement with an adjudication, so a reader can audit the
  labels rather than trust them.
