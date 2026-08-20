![Governed Workflow for DSH](docs/assets/governed-workflow-for-dsh-hero.png)

# 中文

## 1. 插件简介

`dsh-governed-workflow` 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立社区插件，用来给 Coding Agent 增加一层明确的任务权限、生命周期和独立验收边界。

它把一个常见的 vibe-coding 流程从“给 Agent 一句话，然后让它自由修改”收敛成：**先由 GitHub Issue 给出任务 authority，只有进入 `RUNNING` 后才允许受保护的修改，完成或阻塞后冻结修改并交给独立 Reviewer / Owner。**

当前版本为 **V0.9 Developer Technical Preview**；已验证基线为 `@deepseek-ai/dsh@0.1.0-rc.6`，包名为 `dsh-governed-workflow`。本项目不隶属于 DeepSeek，也不代表 DeepSeek 官方背书。

## 2. 具体功能

### 工作流

```text
GitHub Issue Authority
        ↓
     OBSERVE
        ↓
      ADMIT
        ↓
       RUN
        ↓
BLOCK / COMPLETE
        ↓
      REVIEW
```

- **GitHub Issue Authority**：可以从公开 GitHub Issue 中读取机器可解析的 authority block；Builder 不应从旧聊天记录、分支存在或自己的计划中推断任务权限。
- **Lifecycle 状态机**：任务按 `AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED/COMPLETED → REVIEW_PENDING` 推进，非法迁移 fail closed。
- **RUNNING-only Mutation Guard**：当前受保护的 DSH mutation tools 为 `bash`、`write`、`edit`；没有 accepted authority 或状态不是 `RUNNING` 时拒绝执行。
- **模型侧治理工具**：提供只读的 `governance_status`，以及受限动作集的 `governance_transition`。
- **终态冻结**：进入 `BLOCKED`、`COMPLETED` 或 `REVIEW_PENDING` 后重新禁止受保护修改。
- **独立验收边界**：Builder 不能自行 ACCEPT、merge、关闭已接受任务或创建/激活后续任务；最终决定留在 Builder Runtime 之外。
- **治理证据**：authority 观察与 lifecycle transition 会记录为受限治理证据，方便审查和回放。

### 这种工作流的取舍

**优势**：任务边界更清楚，能减少长会话中的 scope drift 和误修改；什么时候可以改、什么时候必须停止比较明确；对需要真实验收、回滚和审查的项目更友好。

**劣势**：比自由式 vibe coding 多了 Issue、状态迁移和 Review 的流程成本，因此会牺牲一部分速度；当前实现也不是完整 OS sandbox——`allowedPaths` 文件系统硬隔离、Git 命令语义、GitHub merge/close API 等仍不是 Runtime 强制边界。

**更适合**：中等及以上规模、多文件、长会话、多阶段交付、需要运行命令/修改真实代码、上线或数据风险较高的 vibe-coding 项目，例如 App、后端服务、研究工具、自动化系统和长期维护仓库。

**不太适合**：一次性小脚本、几分钟的 throwaway prototype、完全可丢弃的实验；这类任务的治理成本可能高于收益。

## 3. 安装方式

IH-1 正在把安装方式收敛为一个可维护、可 clean-room 验证的安装脚本。当前候选脚本已经是：

```text
scripts/install-dsh-governed-workflow.mjs
```

候选调用方式为：

```bash
node scripts/install-dsh-governed-workflow.mjs --profile governed --ref <40位 Git commit SHA>
```

该脚本要求显式提供 DSH Profile 和 **immutable source ref**，不会默认安装浮动的 `main`。当前候选实现会执行固定 GitHub source install，并在安装后自动运行：

```bash
dsh --profile governed --dump-config
```

用于确认 Governed Workflow 的五个默认组件已经加载，同时不会自动启用可选的 GitHub Issue network-authority bootstrap。fileciteturn143file0L1-L6

> **当前状态：IH-1 候选，尚待独立验收。** 在 IH-1 合并前，上述脚本还不在 `main`，因此暂不作为已发布的一键安装命令。验收完成后，这一节会直接替换为最终 clean-room-qualified 命令和固定版本坐标。

---

# English

## 1. Plugin overview

`dsh-governed-workflow` is an independent community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It adds an explicit task-authority, lifecycle, and independent-review boundary around coding-agent work.

Instead of giving an agent a prompt and allowing unrestricted mutation, the plugin turns vibe coding into a governed sequence: **GitHub Issue authority first, protected mutation only while the task is `RUNNING`, then mutation freezes again when the Builder completes or blocks and the result moves to independent review.**

Current stage: **V0.9 Developer Technical Preview**. Verified baseline: `@deepseek-ai/dsh@0.1.0-rc.6`. Package: `dsh-governed-workflow`. This project is not affiliated with or endorsed by DeepSeek.

## 2. Features

### Workflow

```text
GitHub Issue Authority
        ↓
     OBSERVE
        ↓
      ADMIT
        ↓
       RUN
        ↓
BLOCK / COMPLETE
        ↓
      REVIEW
```

- **GitHub Issue Authority** — an opt-in provider can read a machine-readable authority block from a public GitHub Issue; the Builder should not infer authority from stale chat, branch existence, or its own plan.
- **Lifecycle state machine** — tasks progress through `AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED/COMPLETED → REVIEW_PENDING`; illegal transitions fail closed.
- **RUNNING-only Mutation Guard** — protected DSH mutation tools are currently `bash`, `write`, and `edit`; they are denied without accepted authority or outside `RUNNING`.
- **Model-facing governance tools** — read-only `governance_status` plus allowlisted `governance_transition` actions.
- **Terminal freeze** — protected mutation is denied again in `BLOCKED`, `COMPLETED`, and `REVIEW_PENDING`.
- **Independent acceptance boundary** — the Builder cannot self-accept, merge, close an accepted task, or create/activate a successor task; final acceptance stays outside the Builder runtime.
- **Governance evidence** — authority observation and lifecycle transitions are recorded as bounded governance evidence for review/replay.

### Trade-offs

**Advantages:** clearer scope, less long-session drift and accidental mutation, explicit stop conditions, and a better fit for projects that need real review, rollback, or release discipline.

**Disadvantages:** more process overhead than free-form vibe coding because Issues, lifecycle transitions, and review are explicit. It is also not a complete OS sandbox: hard `allowedPaths` containment, Git command semantics, and GitHub merge/close API enforcement are not runtime-enforced today.

**Best fit:** medium-to-large, multi-file, long-running, multi-stage vibe-coding projects where agents can run commands or modify real code and mistakes are costly — apps, backend services, research tooling, automation systems, and maintained repositories.

**Poor fit:** one-off scripts, tiny throwaway prototypes, or fully disposable experiments where governance overhead is larger than the risk being controlled.

## 3. Installation

IH-1 is converging installation onto a maintained, clean-room-qualified installer. The current candidate script is:

```text
scripts/install-dsh-governed-workflow.mjs
```

Candidate usage:

```bash
node scripts/install-dsh-governed-workflow.mjs --profile governed --ref <40-hex Git commit SHA>
```

The installer requires an explicit DSH profile and an **immutable source ref**; it never defaults to floating `main`. The current candidate performs the pinned GitHub source install and then runs:

```bash
dsh --profile governed --dump-config
```

to verify the five default Governed Workflow components, without automatically enabling the optional GitHub Issue network-authority bootstrap. fileciteturn143file0L1-L6

> **Current status: IH-1 candidate, pending independent review.** Until IH-1 is merged, the script is not yet present on `main` and should not be treated as the released one-command installer. After acceptance, this section will be replaced with the exact clean-room-qualified command and pinned release coordinate.
