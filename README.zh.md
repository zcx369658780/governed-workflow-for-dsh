# Governed Workflow for DSH

[English](README.md) | 简体中文

![Governed Workflow for DSH](docs/assets/governed-workflow-for-dsh-hero.png)

> 面向 DeepSeek Harness Coding Agent 的 Authority-first 治理工作流。
>
> **没有被接受的任务权限，就不允许修改；最终验收必须留在 Builder 之外。**

`dsh-governed-workflow` 是一个独立开发的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件，用于把 GitHub Issue 驱动的 Builder 治理流程带入 DSH Runtime，并在修改操作周围增加 fail-closed 生命周期控制。

本项目**不隶属于 DeepSeek，也不代表 DeepSeek 官方背书**。

## 它解决什么问题？

一个受治理的任务遵循明确的生命周期：

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

核心原则：

- **GitHub Issue Authority** —— 任务权限来自明确的权威 Issue，而不是旧聊天记录或 Builder 自己的计划。
- **只有 RUNNING 才能修改** —— 只有 authority 已被接受且生命周期严格处于 `RUNNING`，受保护的修改工具才会被放行。
- **Fail Closed** —— authority 缺失/格式错误、非法状态迁移或终态出现时，默认拒绝修改，而不是尝试绕过。
- **独立 Review** —— Builder 不能自行 ACCEPT、Merge、关闭已接受任务，也不能自行创建/激活后续任务。
- **Evidence-first** —— authority 与生命周期迁移会记录为受限的治理证据。

## 当前状态

**V0.9 — Developer Technical Preview**

当前已经实现：

- Governance 生命周期状态机；
- provider-neutral authority 校验与单快照准入；
- 可选的 Public GitHub Issue authority provider；
- `bash` / `write` / `edit` 的 RUNNING-only mutation guard；
- `governance_status` 与 `governance_transition` 模型工具；
- `governed-builder` Skill；
- Governance evidence 记录；
- Builder 终态后的 fail-closed 修改冻结。

当前验证基线：

```text
DeepSeek Harness: @deepseek-ai/dsh 0.1.0-rc.6
Node.js: ^22.19.0 || >=24.0.0
Integration: DSH Profile Bundle / harness-profile
Package: dsh-governed-workflow
```

目前**尚未发布到 npm**。OMDSH Workshop 投稿已经存在，但独立审核、当前基线验证和 Registry admission 仍未完成。

## 安装

当前正在重新收敛一个**可靠、可复现、面向普通用户的安装流程**。

仓库里保留了以前的 clean-room 源码安装证据，但其中的旧命令和旧固定 SHA **不再作为新用户的 canonical 安装命令**。在新的安装脚本 / 可复现安装指令通过验证之前，我们不会在 README 中宣传一个未经重新验证的一键命令。

目前可以确认的安装事实是：

- 包名：`dsh-governed-workflow`；
- 分发方式：公开 GitHub 源码，尚未发布 npm；
- 集成方式：DSH Profile Bundle；
- 不要把历史 release 记录中的旧安装命令当成当前推荐命令。

如需查看历史验证证据，可参考 [Technical Preview quickstart](docs/technical-preview-quickstart.md) 和 [OMDSH Review Evidence](docs/OMDSH_REVIEW.md)。它们目前属于 qualification / provenance，不是面向新用户的最终安装说明。

## 使用 GitHub Issue 作为任务权限

可选的 GitHub provider 会读取一个公开、打开状态的 GitHub Issue，并只接受一个机器可读的 Authority Block：

```text
<!-- dsh-governed-workflow-authority:v1
{
  "baselineRef": "main",
  "baselineSha": "<40位 Git commit SHA>",
  "candidateBranch": "<任务专用分支>",
  "allowedPaths": ["src/**"],
  "protectedBranches": ["main"]
}
-->
```

这个 provider 是**显式 opt-in** 的，只支持公开 GitHub、匿名只读、单次读取，并固定访问 `https://api.github.com`。默认 bundle 不会主动访问 GitHub。

`allowedPaths` 当前仍是 authority metadata / Builder guidance，**还不是底层文件系统的强制 containment**。

## Builder 生命周期

模型可以使用两个治理工具：

```text
governance_status
governance_transition
```

标准流程：

```text
AUTHORITY_OBSERVED
  → ADMIT_TASK
TASK_ADMITTED
  → RUN
RUNNING
  → COMPLETE 或 BLOCK
COMPLETED / BLOCKED
  → SUBMIT_REVIEW
REVIEW_PENDING
  → 停止并等待独立 Review
```

Builder 没有 `ACCEPTED` 操作。最终接受和 Merge 不属于 Builder 的 Runtime 权限。

## 当前硬性保护边界

当前 Runtime 会强制执行：

- 必须存在 accepted authority；
- 只有 `RUNNING` 才能使用 `bash` / `write` / `edit`；
- `BLOCKED` / `COMPLETED` / `REVIEW_PENDING` 后重新冻结修改；
- 生命周期迁移 allowlist；
- authority / provider 输出重新校验并 fail closed。

当前**尚未**硬性执行：

- `allowedPaths` 的 canonical 文件系统 containment；
- Bash / Git 命令语义解析；
- Git protected branch 命令级强制保护；
- GitHub Merge / Close / Successor API 强制权限；
- Private / authenticated GitHub authority；
- Reviewer / Owner 的 `ACCEPTED` Runtime state；
- 对任意恶意 same-process 插件的进程内隔离。

## 默认安全属性

没有显式启用 GitHub authority bootstrap 时，默认 bundle：

- 不进行网络请求；
- 不读取 GitHub Token 或用户凭据；
- 不以插件 Runtime 行为启动 subprocess；
- 不加载 native code；
- 没有 accepted authority 时默认 fail closed。

## 开发

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## 更多文档

- [架构与信任边界](docs/architecture.md)
- [DSH 兼容性](docs/dsh-compatibility.md)
- [Technical Preview 历史验证](docs/technical-preview-quickstart.md)
- [OMDSH Review Evidence](docs/OMDSH_REVIEW.md)
- [安全说明](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)
- [商标说明](TRADEMARK_NOTICE.md)

## License

[MIT](LICENSE)

---

**Govern first. Ship safe.**
