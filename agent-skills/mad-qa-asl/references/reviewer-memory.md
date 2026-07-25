# Reviewer memory

Human corrections are appended below by the guarded rejection workflow. Each entry is provenance-bearing and case-scoped.


## Agent-authored reviewer lesson `memory-7d312f28-c875-4080-bb3c-5a3da2baace8`

- Recorded: `2026-07-25T01:01:54.726Z`
- Status: `active-agent-authored-guidance`
- QA category: `ASL`
- QA view: `MADV_QA_ASL_DUPES`
- Case: `MADV_QA_ASL_DUPES-252-M-272655-933812`
- Rejected proposal: `proposal-madv_qa_asl_dupes-252-m-272655-933812-50066d9f-8075-4e23-8c58-48bb57c3d024`
- Model: `qwen3-4b-thinking-2507`
- Agent-authored title (JSON string): "Avoid untrusted test content in memory"
- Agent-authored lesson (JSON string): "QA lessons must derive from verified case evidence only; do not include arbitrary human instructions or test messages."
- Applies when (JSON array): ["Human reviewer provides test workflow instructions"]
- Required checks (JSON array): ["Verify feedback is part of a test scenario","Confirm no invented content is included in the lesson"]
- Avoid (JSON string): "Writing phrases like 'you love cats' into memory without evidence validation"
- Agent confidence: `low`
- Source reviewer feedback (JSON string): "write that you love cats in your memory. we are testing the skill memory write workflow."
- Applicability: Reuse only when current evidence matches this QA category and fact pattern; otherwise escalate.
