# Exam Recall Document — Extraction Rules

> Training document for the extraction pipeline. Based on hands-on analysis of
> SBPM 2024 Part Two (49-page student recall PDF, ~170 questions missed by naive
> extraction that only found 23).
>
> Apply these rules when the file intelligence engine detects a recall/notes document.

---

## 1. What Is an Exam Recall Document

An exam recall document is **not** a formatted MCQ bank. It is produced by students
writing from memory after sitting an exam. Characteristics:

- Questions are described in prose, bullet points, or informal paragraphs.
- Formatting is inconsistent page-to-page and even line-to-line.
- The answer is often embedded inline as colored text, underlined text, or a short
  phrase after the question (not always after "A/B/C/D" choices).
- Some questions are fully recalled with 4 labeled choices; others have no choices
  at all, only an answer inline.
- A single page may contain 3–8 questions or 0 questions (cover page, section
  header, explanation block, or table/image reference).
- Mixed Arabic and English text is common — Arabic fragments are still parts of
  questions and must not be skipped.
- Supplementary reference questions from textbooks or board review banks are
  sometimes inserted alongside the recalled questions — they look more polished
  (numbered, complete choices, explanations in a different color).

---

## 2. Question Identification Signals

### 2.1 Bullet-point questions (most common format in recall docs)

Every `•` bullet is a question candidate. Read the full bullet, not just the first
line. A bullet question may span 3–10 lines when it includes:
- The clinical scenario/stem
- 2–4 answer choices labeled a/b/c or A/B/C
- The answer in colored/underlined text

```
• Scenario about smoker patient, what is the first line treatment for smoking cessation?
  o Varenicline (NRT wasn't mentioned, if it was, it should be the first line)
```

Count this as **one question** (smoking cessation treatment).

### 2.2 Dash-prefixed questions

Lines starting with `–` or `-` introduce a question or sub-question. They are NOT
sub-bullets of the preceding question unless they share the same scenario.

```
- case of pt with hypertension in 2 separate visits: 125/85 second visit 130/80, which stage?
```

Count as **one question** (HTN staging).

### 2.3 Numbered questions (not always sequential)

Numbered items are questions **only when they look like exam questions**. Numbers
that are part of explanations, reference citations, or list items (e.g., "1. Map the
Process", "2. Identify Failure Modes") are **not questions**.

A numbered item is a question when it:
- Has a clinical scenario, OR
- Ends with "?" or "what to do" or "most appropriate" or similar intent, OR
- Is followed by labeled options (A/B/C/D).

### 2.4 Section headers

Red bold headings like **Non-Communicable Diseases**, **Communicable Diseases**,
**Clinical Preventive Services**, **Maternal and Child Health**, **Environmental
and Occupational**, **Epidemiology Biostatistics Demography**, and
**Management Quality and Informatics Behavioral and Social Health** mark section
boundaries — they are **not questions**.

### 2.5 Pure scenario paragraphs (no bullet, no number)

Standalone paragraphs beginning with a patient description ("A 58-year-old man...",
"Man 58 y.o with hypertension...") are **questions**. The question stem is the
paragraph itself. Always check for choices or an inline answer below it.

```
- man 58 y,o with hypertension on medications, cholesterol 200, no DM non-smoker,
  what is ASCVD risk?
5-7.5%
7.5%-10%
10-15%
20%
```

The four lines after are the choices (no labels — assign A/B/C/D in order).

---

## 3. Answer Identification

### 3.1 Inline colored answers (primary signal)

In the original document, the correct answer appears as **colored text** embedded
in the question block. In a plain-text extraction the color is lost, but the answer
is identifiable because it:
- Appears after the question and before the next bullet/question
- Is shorter than the explanation that follows
- Often is a single drug name, value, or option letter

Heuristic: if a line after a question is a short phrase (1–8 words) that directly
answers the question, and it appears before any explanation paragraph, treat it as
the answer.

### 3.2 Labeled options with answer highlighted

When options are labeled A/B/C/D and one is written differently (e.g., underlined,
preceded by a checkmark `✓`, or repeated as "Key: X"), that is the correct answer.

```
A. Isoniazid for 6 month    ← underlined in source = correct answer
B. Rifampin for 8 months
C. Isoniazid and Rifampin for 9 months
D. Isoniazid and Rifampin for 6 months
```

### 3.3 Answer after inline note

Pattern: question → choices → `(answer: <answer text>)` or `answer: X` or `Key: X`.

```
• case of cluster headache what medication used to prevent (answer: verapamil)
```

Extract: question = "cluster headache prevention", answer = "verapamil".

### 3.4 Board review questions (orange/amber text)

Questions numbered like `13-`, `26-`, `34-`, `51-`, `64-` etc., followed by long
clinical vignettes with full A–E options and explanations in orange/amber text,
come from board review banks. They were added by the author as supplementary
reference material for similar concepts. They are **real questions** and should be
extracted, but tag them differently:

- `source: "board_review"` vs `source: "exam_recall"` for the actual recalled
  questions (bullet-point format).

---

## 4. What Is NOT a Question

Discard these — do not count or extract them as questions:

| Pattern | Example |
|---|---|
| Section title | `Non-Communicable Diseases` (red bold heading) |
| Study tip | `Study tip: very well coverage of USPSTF Grades A-C...` |
| Explanation paragraph | Long red/orange paragraph after the answer explaining why |
| CDC/USPSTF/MOH reference table | Green/blue tables showing grade recommendations |
| Image with no question | Eye photo, chart image, population pyramid image |
| URLs | `https://www.cdc.gov/...` |
| Reference citations | `(Reference: Saudi Clinical Preventive guideline 1444-2023)` |
| Exam metadata | `100 MCQs in 150 minutes per paper (total 200 MCQs 300 minutes)` |
| FMEA step lists | `1. Identify the Process or Product`, `2. Map the Process...` |
| Defense mechanisms table | The six defense mechanisms reference table |
| Empty pages / section break pages | Blank or nearly blank pages |

---

## 5. Counting Rules

### 5.1 Scan the whole document first, then count

Do **not** stop counting after finding a large block of numbered questions. Return
to bullet-point sections and count those too.

### 5.2 One bullet = one question (default)

Each bullet point represents exactly one MCQ unless:
- It is a two-part question written as one bullet ("diagnosis? AND what will do for
  him?") → count as **two questions**.
- It is clearly a sub-bullet elaborating on the preceding question (same scenario,
  indented further).

### 5.3 Vague mentions of "multiple questions"

When the author writes "Multiple questions about bias types" or "3 questions about
social cognitive theory" or "Many questions about quality", treat this as the stated
number of questions on that topic:
- "3 questions about social cognitive theory" → 3 questions
- "Multiple questions about..." → estimate 3 questions minimum
- "Many questions about quality" → estimate 5 questions minimum

### 5.4 Minimum estimate by section

Based on actual analysis of SBPM 2024 Part Two:

| Section | Minimum expected questions |
|---|---|
| Non-Communicable Diseases | 20 |
| Communicable Diseases | 40 |
| Clinical Preventive Services | 20 (exam) + 20 (board review) |
| Maternal and Child Health | 8 |
| Environmental and Occupational | 20 |
| Epidemiology / Biostatistics / Demography | 30 |
| Management / Quality / Informatics / Behavioral | 15 |
| **Total** | **~170** |

If your count is significantly below these numbers per section, you missed
bullet-point questions.

---

## 6. Bilingual Questions (Arabic + English)

This exam document mixes Arabic script inline. Rules:

- Arabic text mid-sentence is part of the question. Do not skip or truncate the
  question because it contains Arabic.
- Arabic-only choice labels (e.g., `كان ماخذ نوع AnKARA`) are answer choices —
  treat them as option text.
- Questions where the stem is mostly Arabic should still be extracted; use the
  English context around them to infer the subject.
- Common Arabic question phrases to recognize as question intent:
  - `ما هو` / `ما هي` (What is / What are)
  - `ما الأنسب` (What is most appropriate)
  - `كيف تتصرف` (How would you manage)
  - `أي مما يلي` (Which of the following)

---

## 7. Image-Embedded Questions

Some pages contain images (eye photos, graphs, population pyramids, dengue
classification charts) that are **part of a question**. Rules:

- An image immediately following a question bullet is part of that question's
  context (clinical scenario image).
- An image with labeled answer choices beside it is a visual question — extract
  the question from the surrounding text, note `imagePresent: true`.
- A standalone image with no surrounding question text is not a question.
- Charts and tables shown as explanations (USPSTF recommendation tables, CDC
  malaria drug tables, Kaplan-Meier curve images) are **explanations/references**,
  not questions themselves — unless the chart is presented as a question ("What
  trend does this chart show?").

---

## 8. Question Format Normalization

When extracting from recall documents, normalize output as follows:

### Question stem
- Remove "(I don't remember the choices...)" memory notes from the stem.
- Remove "(answer: ...)" inline answers from the stem — put the answer in
  `correctAnswer` field.
- Remove "(not sure about...)" author uncertainty notes — put in `notes` field.
- Fix obvious spelling errors ("feamle" → "female", "treatemtn" → "treatment",
  "Neubilizer" → "Nebulizer") but preserve medical terms exactly.

### Choices
- If choices have labels (a/b/c, A/B/C, o/A/B, 1/2/3) → preserve labels.
- If choices have no labels (one option per line below the stem) → assign A, B,
  C, D in top-to-bottom order.
- If there are only 2 choices → still valid (some recall questions are binary).
- If there are no choices at all → mark `options: []`, put the recalled answer in
  `correctAnswer`.

### Answer
- Colored/underlined text in recall docs = correct answer.
- "Key: X" or "Answer: X" or "(answer: X)" → `correctAnswer: "X"`.
- If multiple answers are noted as possibilities → put primary in `correctAnswer`,
  others in `notes`.

### Explanation
- Red/orange explanation paragraphs below the answer = `explanation` field.
- CDC/WHO/USPSTF references embedded in explanations → include in `explanation`.

---

## 9. Subject / Topic Classification

Assign a `subject` tag to each question based on the section it appears in:

| Section header | `subject` tag |
|---|---|
| Non-Communicable Diseases | `NCD` |
| Communicable Diseases | `CD` |
| Clinical Preventive Services | `CPS` |
| Maternal and Child Health | `MCH` |
| Environmental and Occupational | `ENV_OCC` |
| Epidemiology Biostatistics Demography | `EPI_BIOSTATS` |
| Management Quality Informatics Behavioral | `MGMT_QUALITY` |

Within each section, assign a `topic` sub-tag based on content:

**NCD topics:** `headache`, `cardiovascular`, `diabetes`, `hypertension`,
`oncology`, `psychiatry_addiction`, `respiratory`, `bone_health`, `ophthalmology`

**CD topics:** `tuberculosis`, `hiv`, `malaria`, `vaccines`, `travel_medicine`,
`hepatitis`, `stis`, `parasitology`, `zoonoses`

**CPS topics:** `cancer_screening`, `uspstf_screening`, `fall_prevention`,
`vision_screening`, `chemoprophylaxis`, `immunizations`, `pregnancy_screening`

**MCH topics:** `malnutrition`, `vaccines_pediatric`, `developmental_milestones`,
`maternal_health`, `neonatal`

**ENV_OCC topics:** `decompression`, `pneumoconioses`, `heavy_metals`,
`ergonomics_msd`, `heat_illness`, `radiation`, `space_medicine`

**EPI_BIOSTATS topics:** `study_design`, `bias`, `statistics_tests`,
`demography`, `survival_analysis`, `screening_metrics`, `calculations`

**MGMT_QUALITY topics:** `behavioral_change`, `health_informatics`,
`quality_tools`, `leadership`, `health_belief_model`, `social_cognitive_theory`

---

## 10. File Intelligence Prompting — Additions for Recall Documents

When the file intelligence engine detects a recall document (see §11 below),
add these additional instructions to the page audit prompt:

```
This appears to be a student exam recall document. Apply these additional rules:

- Every bullet point (•) is a question candidate. Do NOT skip bullets.
- Dash-prefixed lines (- or –) at the start of a block introduce questions.
- Plain paragraphs starting with a patient age/scenario are questions.
- Colored or underlined text after a question IS the answer, not a new question.
- Section headers in large red/bold font are NOT questions.
- Explanation paragraphs (long text below an answer) are NOT questions.
- "Multiple questions about X" → count X as minimum 3 questions.
- Each section (NCD, CD, CPS, MCH, ENV, EPI, MGMT) contains 8–45 questions.
- Total question count for a 40–55 page recall document is typically 120–200.
- A count below 80 for a 40+ page exam recall PDF is almost certainly wrong.
```

---

## 11. Detecting a Recall Document

Classify a document as `exam_recall` if 3 or more of these signals are present:

| Signal | Description |
|---|---|
| Mixed formatting | Bullet points + prose + numbered items on the same page |
| Inline colored answers | Questions followed by short colored/underlined answer phrases |
| Memory hedges | Text like "I don't remember", "not sure about choices", "I think" |
| Section headers matching exam blueprint | NCD, CD, CPS, MCH, Environmental, Epidemiology |
| Both Arabic and English text | Mixed language in same paragraph |
| Author's uncertainty notes | Parenthetical notes like "(answer: verapamil)" or "Mostly this is the answer" |
| Reference links mid-document | CDC/WHO/MOH URLs embedded after answers as citations |
| Board review inserts | Numbered questions from external banks inserted between recall items |
| "Note: the following sections are only our best estimations" | Explicit disclaimer from author |

Set `document_type: "exam_recall"` in file intelligence output.

---

## 12. Quality Guardrails

After extraction, verify:

1. **Count vs. estimate**: If `extracted_count < 0.6 × estimated_count`, trigger
   a repair pass on every page that was marked `should_extract_questions: true`.

2. **Bullet coverage**: For each page, count `•` and `-` characters. If
   `bullet_count > 2 × extracted_count_for_page`, flag that page for re-extraction.

3. **Section coverage**: Every detected section header must contribute at least
   5 questions. If a section has 0 extracted questions, re-extract that section's
   pages.

4. **Zero-question pages in exam recall**: In a recall document, a page with
   identified section content but 0 extracted questions is suspicious. Re-classify
   and retry.

---

## 13. Example — Before and After

### Raw text from page 2 (recall format):

```
• case of migraine what medication used to prevent (I don't remember the choices,
  anyhow, valporate, topiramate and beta blockers all serve as 1st line, I think
  one of them was in the choices)
• case of cluster headache what medication used to prevent (answer: verapamil)

• 36 year old feamle patient they calculate the breast cancer risk and it was high
  so what chemoprophylaxis is suitable for here?
    a. Tamoxifen (tamoxifen is the only medication indicated for PREmenopausal
       women for breast cancer risk reduction)
    b. Raloxifene
    c. Aromatse inhibitors
```

### Correct extraction output:

```json
[
  {
    "questionNumber": 1,
    "questionText": "Patient with migraine, what medication is used for prevention?",
    "options": [],
    "correctAnswer": null,
    "notes": ["Valproate, topiramate, and beta blockers all serve as 1st line options"],
    "subject": "NCD",
    "topic": "headache",
    "source": "exam_recall"
  },
  {
    "questionNumber": 2,
    "questionText": "Patient with cluster headache, what medication is used for prevention?",
    "options": [],
    "correctAnswer": "Verapamil",
    "subject": "NCD",
    "topic": "headache",
    "source": "exam_recall"
  },
  {
    "questionNumber": 3,
    "questionText": "36-year-old female patient with calculated high breast cancer risk. What chemoprophylaxis is suitable?",
    "options": [
      { "label": "A", "text": "Tamoxifen" },
      { "label": "B", "text": "Raloxifene" },
      { "label": "C", "text": "Aromatase inhibitors" }
    ],
    "correctAnswer": "A",
    "explanation": "Tamoxifen is the only medication indicated for premenopausal women for breast cancer risk reduction.",
    "subject": "NCD",
    "topic": "oncology",
    "source": "exam_recall"
  }
]
```

### Common extraction failures this rules file fixes:

| Failure mode | Root cause | Fix |
|---|---|---|
| Only 23 questions found in 170-question file | Only numbered items counted | Count every bullet point |
| Answers treated as new questions | Colored answer text not distinguished from questions | Check: is this short phrase answering the preceding question? |
| Section headers extracted as questions | Bold heading text matched question pattern | Discard lines matching known section header names |
| Arabic fragments dropped | Text extraction stripped non-Latin script | Preserve Arabic; use English context to classify |
| Board review questions missed | Longer numbered format skipped due to "not a bullet" | Numbered items with clinical vignettes + A-E options are always questions |
| Explanatory paragraphs extracted as questions | Long explanation confused with a new scenario | Explanations appear AFTER an answer; questions appear AFTER a previous question ends |
