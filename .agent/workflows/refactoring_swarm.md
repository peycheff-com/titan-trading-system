---
description: Refactoring Swarm (Planner -> Worker -> Judge)
---

This workflow executes a safe, verified refactoring task using the Agentic Swarm pattern.

# Role: The Planner
1.  **Scope the Task**: Identify the specific files and logic to refactor.
2.  **Check Knowledge**: Review `titan_execution_engine` or `titan_brain_orchestration` KIs.
3.  **Define Constraints**: Ensure the "Worker" only touches the scoped files.

# Role: The Worker
4.  **Execute Changes**: Perform the code modification.
5.  **No "YOLO" Commits**: Do not commit anything yet.

# Role: The Judge
6.  **Run Verification**:
    // turbo
    ```bash
    /Users/ivan/Code/trading/titan/services/shared/scripts/judge_verification.py --service [SERVICE_PATH]
    ```
7.  **Analyze Verdict**:
    - If `status: "PASS"` -> **Commit and Push**.
    - If `status: "FAIL"` -> **Revert and Retry** (or ask User).

> [!IMPORTANT]
> The Judge's verdict is final. Do not bypass the verification script.
