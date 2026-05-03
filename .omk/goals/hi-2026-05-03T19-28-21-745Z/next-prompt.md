# Goal: hi

## Objective
hi

## Success Criteria
- [required] The objective is completed and the result is demonstrable

## Intent Analysis
- Task type: general
- Complexity: simple
- Estimated workers: 1
- Required roles: planner, coder, reviewer
- Read-only: true
- Needs research: false
- Needs security review: false
- Needs testing: false
- Needs design review: false
- Parallelizable: false
- Rationale: taskType=general (score=0); complexity=simple; readOnly=true; parallelizable=false; roles=[planner, coder, reviewer]

## Orchestration Instructions
- Source command: default
- Workers: auto
- Execution mode: parallel DAG (always)

### DAG Structure (minimum)
1. **intake** – parse and validate the goal
2. **memory-recall** – load relevant project context via omk_search_memory / omk_memory_mindmap
3. **coordinator** – plan decomposition and assign worker scopes
4. **worker-N** – execute scoped sub-tasks in parallel
5. **reviewer** – verify outputs, check evidence gates, merge results
6. **quality/evidence** – run quality gates and collect evidence
7. **memory-writeback** – write decisions, risks, and completion state to .omk/memory/

### Dynamic Role Assignment
Based on the intent analysis above, assign workers to these roles:
  - 1. **planner** – scoped to the task type (general)
  - 2. **coder** – scoped to the task type (general)
  - 3. **reviewer** – scoped to the task type (general)

### Mandatory Rules
- Before planning, the coordinator MUST call omk_memory_mindmap or omk_search_memory to load relevant project context.
- Workers MUST only use skills and MCP servers relevant to their assigned role (routing hints).
- Use MCP servers (omk-project, memory, quality-gate) when they fit the task.
- Prefer omk-project MCP tools for checkpoint, memory, and run-state operations.
- Use SearchWeb / FetchURL for external docs, official APIs, or citations.
- Produce concrete evidence, changed files, and verification results.
- Write final decisions and risks to .omk/memory/decisions.md and .omk/memory/risks.md.

### Continue Engine
If this is a continuation, focus on missing success criteria and failed evidence gates.
Re-select worker roles and MCP/skills based on the remaining work.