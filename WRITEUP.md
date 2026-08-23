# Ironbark Ridge Resources --- ESG & Safety Intelligence

This project is an ESG and safety reporting pipeline and dashboard for
an open-cut coal mine in Queensland, covering **January 2025 to June
2026**.

It takes **five CSV exports** containing operational, emissions,
supplier and safety data and turns them into information that can be
used for reporting and review.

The pipeline cleans and validates the source data without changing the
originals, calculates **Scope 1 emissions from fuel** and **Scope 2
emissions from electricity**, and analyses the incident register for
safety issues that may not be captured by the existing incident codes.

The main principle behind the project is simple:

> ** Every number and finding in the dashboard should be traceable back to 
> its source, with any changes and decisions clearly explained.**


**Stack:** TypeScript, PostgreSQL/Neon, Drizzle, Express, Vue 3 and the
Anthropic API.

------------------------------------------------------------------------

## 1. How to run the project

``` bash
npm install

cp .env.example .env          # DATABASE_URL, ANTHROPIC_API_KEY

npm run db:migrate            # create/update database schema
npm run seed                  # load emission factors, sites and reporting periods
npm run ingest                # read, validate and clean the five CSV files
npm run label                 # load hand-written incident benchmark labels
npm run enrich                # run AI classification across the 42 incidents
npm run evaluate              # compare AI results against the labels

npm run dev                   # API on :3000
npm run dev --prefix web      # dashboard on :5173

npm test                      # run the test suite
```

------------------------------------------------------------------------

## 2. How I handle source data

One rule sits underneath the whole project:

**I never edit the original source data.**

Every CSV row is first stored exactly as it arrived in `source_row`,
together with information such as its file, row number and hash.
Cleaning happens on a separate interpreted version of that row.

``` text
source file
    ↓
source row
    ↓
validation / cleaning
    ↓
typed database record
    ↓
dashboard / calculations

and alongside that:

data quality finding
```

Whenever the pipeline changes, flags or rejects something, it records
**what happened and why**.

-   **Fixed** --- the correct value can be determined confidently, so
    the interpreted value is corrected while the original remains
    available.
-   **Flagged** --- something looks suspicious or needs attention, but
    there isn't enough evidence to change it automatically.
-   **Rejected** --- the row cannot safely be used and is excluded.

For this dataset, **315 rows were read, 315 were promoted and 0 were
rejected**. A database constraint checks that rows cannot silently
disappear during ingestion.

This traceability also carries into the dashboard. The Emissions
calculation page can take a month and show the individual source rows,
values used, emission factors and resulting emissions that produced the
reported total.

------------------------------------------------------------------------

## 3. The main data problems I found

There were a lot of straightforward formatting problems --- dates,
currency symbols, inconsistent versions of litres and kilolitres, for
example. Those are relatively easy to clean.

The more interesting problems were the ones where I had to make an
actual decision.

### Electricity meter MTR-07 changed units

From October 2025, MTR-07 suddenly dropped from readings around
**274,791** to around **277**, while the other meters continued
normally.

The pattern strongly indicates that the meter started reporting **MWh
while still being labelled as kWh**.

If I had accepted those values literally, Scope 2 emissions would have
been understated by approximately **1,544.2 t CO₂e**:

-   As supplied: **23,333.2 t CO₂e**
-   Corrected: **24,877.4 t CO₂e**

I didn't overwrite the source reading. The project keeps the value as
reported alongside the corrected kWh value, and the dashboard lets the
user switch between **As reported** and **Corrected**.

### November 2025 has no fuel data

There are no fuel delivery records for November 2025. That's different
from saying the mine used **zero fuel**.

A reporting-period table contains every month in the reporting window,
so November doesn't disappear from the chart. The dashboard reports the
month as **No data**, rather than `0`.

### Seven fuel invoices are duplicated

Seven invoices appear twice in the source data.

I keep both source rows for traceability, but mark the later record as a
duplicate. Emission calculations exclude the duplicate rather than
deleting it from the database.

With duplicates correctly excluded, Scope 1 rises **34% from January
2025 to June 2026**. Including the duplicate records would have
exaggerated that trend.

### INV-41777 contains negative fuel and cost

The record contains **−12,500 L** and **−\$23,375**.

Both values are negative and consistent at approximately **\$1.87/L**,
which is within the diesel price range in the dataset. The invoice
number also sits outside the normal sequence, the values are unusually
round, and the transaction occurs one day after another Haul Fleet
delivery.

That strongly suggests some form of reversal or adjustment. But the
source file never actually says it is a credit note.

So I don't convert that inference into a fact.

The row is retained as a **negative adjustment**, remains visible for
review and reduces August 2025 Scope 1 by **33.75 t CO₂e**. Someone with
access to the supplier statement would need to confirm what actually
happened.

### Incident severity isn't consistently coded

Most incident severity values are numbers such as `1`, `2` and `3`, but
ten incidents use text such as `Low` and `Medium`.

The data doesn't support a simple global mapping such as `Low → 1`.
Instead, textual values are resolved using comparable numerically coded
incidents with the same description. If those examples don't provide a
consistent answer, severity remains unresolved and gets flagged.

One incident, **INC-2025-011**, remains unresolved for exactly this
reason.

### Supplier records describe the same companies differently

The supplier export contains **15 records representing 13 companies**.

For **Blackwood**, a shared ABN provides strong evidence that two
differently written names refer to the same company.

For **Ironline**, one record has no ABN, so the match relies on a
normalized company name. That's a weaker inference, and the matching
method is recorded because those are not equivalent claims.

The inferred Ironline match moves around **\$1.21 million of spend**
onto the matched company, so keeping that reasoning visible matters.

### MTR-06 is missing

The electricity meters run from MTR-01 through MTR-07, except there is
no MTR-06.

The data doesn't tell me whether it was decommissioned, renamed, or
accidentally left out. Because I can't determine the answer from the
supplied data, I don't invent electricity consumption for it.

------------------------------------------------------------------------

## 4. An insight I wasn't asked to find

The most interesting insight came from looking at **emissions and safety
together**.

### March 2026 looks good until you understand why

                     February           March     Change
  ----------- --------------- --------------- ----------
  Scope 2           1,402.6 t         507.1 t       −64%
  Scope 1           1,311.8 t       1,893.9 t       +44%
  **Total**     **2,714.4 t**   **2,401.0 t**   **−12%**

If I only looked at Scope 2, March would appear to be an excellent
month.

But **INC-2026-131** records a regional substation failure and loss of
grid electricity. Backup diesel generators were used for roughly three
weeks.

So Scope 2 fell because the mine temporarily shifted from grid
electricity to diesel generation, which explains the sharp rise in Scope
1.

Later in March, **INC-2026-134** reports crews experiencing fatigue
after extended shifts supporting generator operations.

So falling electricity emissions, rising diesel emissions and crew
fatigue are different consequences of the **same operational event**.

That's one of the main reasons I think emissions and safety belong
together in this dashboard.

------------------------------------------------------------------------

## 5. How AI is used in the product

The incident register contains useful information in free-text
descriptions that isn't captured by its existing codes. For example,
there is **no dedicated psychosocial hazard code**.

The AI reads all **42 incident descriptions** and turns the unstructured
text into structured safety findings.

For each incident, it determines:

-   the most appropriate hazard category,
-   whether the description indicates a psychosocial hazard,
-   whether the recorded severity appears inconsistent with the
    described outcome,
-   its confidence,
-   its reasoning,
-   and an exact evidence quote from the incident description.

On the current dataset, it identifies **4 psychosocial hazards**, all
originally filed under `OTH`, and **4 potential severity concerns**.

### Making the AI output defensible

#### A hand-written benchmark

All 42 incidents have manually written expected labels based on a
documented rubric. Those labels were created **before the classification
prompt**.

#### Structured output

The model must respond through a fixed schema with known fields and
allowed categories rather than arbitrary prose.

#### Every finding needs evidence

Every assessment includes an exact quote from the original incident
description. The application checks that the quote actually exists in
the source text. If it doesn't, the finding is discarded.

Currently, **42 out of 42 classifications pass that grounding check**.

#### No AI calls when somebody opens the dashboard

AI enrichment happens offline. Results are stored in the database and
the dashboard reads those stored results.

------------------------------------------------------------------------

## 6. How I tested whether the AI was actually useful

A perfect evaluation score worried me rather than reassuring me.

The original prompt tells the model how classification should work, so a
perfect score could simply mean it is good at following those
instructions.

I therefore created a second prompt that removes the classification
criteria and asks the same model to make the same decisions using its
own judgement.

Psychosocial detection remained **4 out of 4 with no false positives**.

Severity did not. Without the explicit severity rule, precision dropped
to **44%**.

That showed me that the psychosocial result appears relatively robust,
while the severity result depends heavily on the explicit rule in the
prompt.

------------------------------------------------------------------------

## 7. How I used AI tools while building the project

I used **Claude Code** as a pair-programming assistant for scaffolding,
TypeScript, SQL, Vue components and parts of the test suite.

But I treated generated code and recommendations as suggestions, not
ground truth.

The part I deliberately owned was the **rule catalogue** --- especially
what should happen to questionable data and why.

### What AI got wrong

#### It initially recommended rejecting the negative fuel transaction

A model saw INV-41777's negative quantity and suggested treating it as
invalid data.

That would have removed a **−12,500 L** transaction and overstated
Scope 1. Writing down the rationale exposed that there wasn't enough
evidence to justify dropping it.

#### It turned an inference into a fact

I originally called the same transaction a `credit_note`.

The evidence makes that plausible, but the source never actually says
it. I changed the model and rule names to describe it as a **negative
adjustment/activity** instead.

#### It gave me an incorrect warning about the Scope 1 trend

AI suggested the **34% increase in Scope 1** might have been caused by
duplicate invoices.

Checking the actual query showed duplicates were already excluded.
Including them would actually have exaggerated the trend to **52%**.

#### An architecture review produced false critical findings

An AI-generated review raised three high-priority problems. Two were
wrong.

I checked each claim against the implementation before changing
anything. The one useful finding --- that I was overclaiming the
negative fuel transaction as a confirmed credit note --- was valid and I
changed it.

#### Tooling nearly caused data loss

When renaming the credit-note field, a generated migration could have
treated it as a drop-and-create and erased the existing flag. I used a
column rename instead and verified the stored row afterwards.

### How I caught these problems

1.  **Written rule rationales** --- every cleaning decision has to
    explain why it exists.
2.  **Independent reconciliation** --- the detailed emissions
    calculation and dashboard aggregation are calculated separately and
    tested to agree.
3.  **Tests against real source rows** --- including failure cases.
4.  **Checking AI claims against the source and implementation** before
    acting on them.

> **AI made me much faster, but anything important still needed a
> mechanism that forced it to be checked.**

------------------------------------------------------------------------

## 8. Limitations

### The AI evaluation has one human rater

I wrote both the labels and the prompt. The rubric and ablation reduce
the circularity, but they don't eliminate it.

There are only 42 incidents, and only four carry the psychosocial
signal, so one disagreement would move a 100% result down to 75%.

### Ingestion currently replaces the active dataset

Running ingestion rebuilds the imported records. Because the AI
classifications depend on those incident rows, ingestion can also remove
existing classifications.

A production version should keep ingestion runs separately and publish a
new run only when it is complete.

### Some assumptions can't be resolved from the supplied data

-   INV-41777 needs the supplier statement to confirm the negative
    adjustment.
-   MTR-06 needs confirmation from the site.
-   Supplier matching without an ABN remains an inference.
-   There is no Scope 3 calculation.
-   The supplied emission factors are indicative.

I deliberately surface those uncertainties rather than inventing values
to make the dataset look complete.

------------------------------------------------------------------------

## 9. What I would build with another week

### 1. Make ingestion runs first-class

Every promoted record would belong to an `ingestion_run`, and the API
would continue serving the last successfully published run until the
next one completed successfully.

### 2. Add proper AI analysis runs

I'd add an `ai_analysis_run` containing the model, prompt version,
prompt hash, timestamps and run status.

### 3. Resolve the questions the data can't answer

I'd confirm INV-41777 against the supplier statement and MTR-06 with the
site.

### 4. Add a second incident reviewer

Having another person independently label the 42 incidents would
strengthen the AI evaluation more than additional prompt engineering.

### 5. Explore Scope 3

Supplier spend could eventually contribute to Scope 3 reporting, but the
current files don't contain the join needed to reliably connect
deliveries to suppliers.

------------------------------------------------------------------------

## 10. Testing

The project currently has **169 tests**.

I deliberately use real rows from the supplied CSVs rather than creating
convenient fake examples.

  ------------------------------------------------------------------------
  Layer                                        Tests Purpose
  --------------------- ---------------------------- ---------------------
  Rules                                           93 Cleaning rules and
                                                     failure cases

  Domain                                          48 Emissions
                                                     reconciliation, row
                                                     accounting,
                                                     missing-data
                                                     behaviour and
                                                     grounded AI evidence

  API                                             28 Routes, response
                                                     contracts and error
                                                     handling
  ------------------------------------------------------------------------

There are also deliberate failure tests. If the pipeline encounters an
unknown unit or a date it genuinely cannot interpret, it should fail
rather than quietly guess.

The frontend and API share contract schemas, so an API response that
changes unexpectedly should fail the test suite instead of producing a
mysterious broken dashboard.

------------------------------------------------------------------------

## Final summary

The project started as a way to turn five messy CSV exports into an ESG
and safety dashboard.

But the part I ended up focusing on most was **trust**.

For emissions, that means being able to go from a dashboard total back
to the individual activity records and emission factors that produced
it.

For safety, it means not presenting an AI finding unless the model can
point back to evidence in the original incident description.

For data quality, it means keeping the original source row and recording
every correction, flag and exclusion instead of silently cleaning the
data.

And when the source doesn't contain enough information to make a
confident decision, the system should say that.

**The goal isn't to make messy data look perfect. It's to make the
decisions made from that data explainable.**
