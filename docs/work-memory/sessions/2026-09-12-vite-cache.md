<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-vite-cache",
  "date": "2026-09-12",
  "title": "Vite 缓存：应用与浏览器夹具独立",
  "kind": "retrospective",
  "status": "recorded",
  "topics": [
    "vite-cache"
  ],
  "summary": "端口和 root 不足以隔离依赖缓存；专用夹具还需独立入口和完整 mock。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "422ea8a6",
  "commits": [
    "e026baa0"
  ],
  "sources": [
    {
      "path": "docs/runtime-guardrails.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/actions/runs/34677060058"
    }
  ],
  "supersedes": []
}
-->
# Vite 缓存：应用与浏览器夹具独立

## 背景与范围

用户反复遭遇 Vite 依赖过期导致终端启动失败。后续 CI 冷启动检查暴露账户夹具缺失 mock 导出、专用夹具被共享优化扫描的问题。

## 结论与依据

- 应用 dev、共享浏览器夹具、下单专用夹具及账户专用夹具使用互不嵌套的独立 Vite cacheDir。更换端口或 root 不能证明默认缓存已隔离。
- 共享入口优化及共享 Playwright 匹配排除专用夹具；专用测试单独执行。冷启动完整 mock 不能依赖开发机热缓存掩盖缺失导出。
- 本议题的 `e026baa0` 同时修复隔离与验证策略重复代码。不能通过持续 force 优化、清空钱包状态或重挂载认证提供器规避缓存问题。

## 验证与限制

历史证据记录下单冷缓存 29 项、账户冷缓存 24 项、远程浏览器合计 99 项通过（对应 e026baa0，见 CI 链接）。本次没有删除当前 dev 缓存、重启服务器或重跑这些用例。一次高负载冷启动超时在独立重跑后通过，不应被包装成修改超时后的通过。

## 后续与替代关系

调整浏览器测试配置前先读 runtime guardrails，并验证缓存路径不仅不同而且互不包含。后续 CI 若失败，先读对应版本日志，不能直接套用“又是缓存”的历史结论。
