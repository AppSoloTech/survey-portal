# SCALE Question Data Model

`scale` questions are represented as option-backed survey questions.

- `survey_questions.question_type = 'scale'`.
- Each rendered numeric scale value is stored as one `answer_options` row.
- `answer_options.option_text` stores the numeric value as text.
- `answer_options.display_order` stores the range order from minimum to maximum.
- Hidden metadata for a scale value uses the existing `answer_tags` table.
- A selected scale answer writes the selected generated option id to
  `survey_response_selected_options`.
- The same selected numeric value is also stored in
  `survey_response_answers.answer_integer` for direct numeric reporting.

The configured minimum and maximum are derived from the generated numeric
`answer_options` rows returned with the question as `scaleMin` and `scaleMax`.
Changing the range regenerates the option rows and is restricted to draft
surveys so published response history is not reshaped.
