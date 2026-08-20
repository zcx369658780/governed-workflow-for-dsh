![Governed Workflow for DSH](docs/assets/governed-workflow-for-dsh-hero.png)

# 中文

`dsh-governed-workflow` 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立社区插件，用 GitHub Issue 作为任务权限来源，并在 Agent 修改代码前后加入 fail-closed 生命周期治理。

本项目不隶属于 DeepSeek，也不代表 DeepSeek 官方背书。

## 插件流程

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

- **Issue 决定任务权限**：Builder 不从旧聊天记录或自己的计划推断 authority。
- **只有 `RUNNING` 才能修改**：当前受保护工具为 `bash`、`write`、`edit`。
- **Fail closed**：缺少/错误 authority、非法状态迁移或进入终态后，修改默认被拒绝。
- **独立验收**：Builder 不能自行 ACCEPT、merge 或创建后续任务；最终决定留给独立 Reviewer / Owner。

当前为 **V0.9 Developer Technical Preview**，验证基线为 `@deepseek-ai/dsh@0.1.0-rc.6`，包名为 `dsh-governed-workflow`。

## 安装

新的 canonical 安装入口正在通过 **IH-1 installer + clean-room qualification** 收敛。该安装器会放在 `scripts/**`，并要求用户显式提供：

- DSH Profile 名称；
- **immutable source ref**（固定 commit / 不允许浮动 `main`）；
- 安装后自动执行 `dsh --profile <name> --dump-config`，确认 Governed Workflow 的五个默认组件已加载；
- 默认不启用可选的 GitHub Issue network authority bootstrap。

在 IH-1 独立验收完成前，README **不再推荐历史 SHA 或旧的一键安装命令**。仓库当前尚未发布到 npm；旧安装记录只作为历史 qualification evidence 保留。

IH-1 完成后，这里会直接替换为经过 clean-room 验证的一行安装脚本命令。

---

# English

`dsh-governed-workflow` is an independent community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It uses GitHub Issues as task authority and adds a fail-closed lifecycle around coding-agent mutation.

This project is not affiliated with or endorsed by DeepSeek.

## Workflow

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

- **Issue-defined authority**: the Builder does not infer authority from stale chat or its own plan.
- **RUNNING-only mutation**: protected tools are currently `bash`, `write`, and `edit`.
- **Fail closed**: missing/malformed authority, illegal transitions, or terminal states deny mutation.
- **Independent acceptance**: the Builder cannot self-accept, merge, or create a successor task; final acceptance stays with an independent Reviewer / Owner.

Current stage: **V0.9 Developer Technical Preview**. Verified baseline: `@deepseek-ai/dsh@0.1.0-rc.6`. Package: `dsh-governed-workflow`.

## Installation

The canonical installation surface is currently being finalized through **IH-1 installer + clean-room qualification**. The maintained installer will live under `scripts/**` and will require:

- a DSH profile name;
- an **immutable source ref** (fixed commit; no floating `main`);
- a bounded post-install `dsh --profile <name> --dump-config` check proving the five default Governed Workflow components are present;
- no automatic activation of the optional GitHub Issue network-authority bootstrap.

Until IH-1 passes independent review, this README intentionally does **not** advertise historical SHAs or old one-command install instructions. The package is not published to npm; older install records remain qualification provenance only.

After IH-1 acceptance, this section will be replaced with the exact clean-room-qualified one-line installer command.
