# Blog Planner — 项目文档

## 项目概述

Blog Planner 是一个**博客内容规划与可视化系统**。它帮助你管理博客的层级结构、主题规划、跨级链接，并自动生成思维导图。

核心理念：**Markdown 文件是唯一真相来源，思维导图只是自动生成的视图。**

你不需要手动维护思维导图——每次新增或修改主题，系统会自动扫描文件、重建内容图谱、更新 Web 界面。

---

## 解决的问题

| 痛点 | 解决方案 |
|------|----------|
| 博客有层级，跨级互相链接 | 树（paths）+ 图（links）混合模型 |
| 每天写新内容时容易重复 | 重复检测：标题相似、同路径冲突、标签重叠 |
| 不清楚写了什么、什么时候写的 | 时间线视图 + status/日期字段 |
| 不知道以后该写什么 | 写作规划视图：优先级、计划日期、依赖链 |
| 层级下该写哪些主题 | 覆盖度视图：每个层级的 idea/draft/published 统计 |
| 手动维护思维导图太麻烦 | 自动生成，文件变更实时同步 |

---

## 架构设计

```
┌─────────────────────────────────────────────────┐
│                   Web UI (React)                 │
│  思维导图 │ 写作规划 │ 时间线 │ 覆盖度 │ 新建    │
└──────────────────────┬──────────────────────────┘
                       │ REST API + SSE
┌──────────────────────▼──────────────────────────┐
│              Express Server (Node.js)            │
│  文件监听 (chokidar) │ API 路由 │ 图谱构建        │
└──────────────────────┬──────────────────────────┘
                       │ 读取/写入
┌──────────────────────▼──────────────────────────┐
│              数据源 (文件系统)                     │
│  topics/*.md  │  taxonomy.yaml  │  graph.json    │
└─────────────────────────────────────────────────┘
```

### 数据流

1. 你在 `topics/` 下创建或编辑 Markdown 文件
2. 文件的 YAML frontmatter 描述元数据（层级、状态、链接等）
3. 服务器通过 chokidar 监听文件变化
4. `graph-builder` 扫描所有文件，构建内容图谱
5. 图谱写入 `graph.json`，同时通过 SSE 推送给 Web UI
6. Web UI 用 React Flow 渲染思维导图

---

## 目录结构

```
blog/
├── docs/
│   └── PROJECT.md          # 本文档
├── topics/                  # 所有主题/文章（扁平存储）
│   ├── go-channel-basics.md
│   ├── go-select.md
│   └── ...
├── templates/
│   └── topic.md             # 新建主题的模板
├── taxonomy.yaml            # 层级树定义
├── graph.json               # 自动生成的内容图谱（勿手改）
├── server/
│   ├── index.ts             # Express API 服务器
│   ├── graph-builder.ts     # 图谱构建核心逻辑
│   ├── build-graph.ts       # CLI: 手动同步图谱
│   ├── check-duplicates.ts  # CLI: 重复检测
│   └── types.ts             # TypeScript 类型定义
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx           # 主应用
│       ├── api.ts            # API 客户端
│       ├── layout.ts         # 思维导图布局算法
│       ├── styles.css
│       └── components/
│           ├── GraphView.tsx       # 思维导图视图
│           ├── PlanningView.tsx    # 写作规划视图
│           ├── TimelineView.tsx    # 时间线视图
│           ├── CoverageView.tsx    # 覆盖度视图
│           ├── NewTopicForm.tsx    # 新建主题表单
│           └── GraphNodeComponent.tsx
├── package.json
└── tsconfig.json
```

---

## 内容模型

每个主题是一个 Markdown 文件，通过 YAML frontmatter 描述元数据：

```yaml
---
id: go-channel-basics          # 唯一 ID，链接靠它
title: Go Channel 原理          # 显示标题
type: topic                     # topic | series | pillar
status: published               # idea | outline | draft | published
created: 2026-05-20             # 创建日期
published: 2026-05-22           # 发布日期
updated: 2026-05-25             # 最后修改

paths:                          # 层级路径（可多路径，解决跨级归类）
  - 技术/后端/Go/并发

links:                          # 显式关联（跨级链接）
  - id: go-select
    relation: related           # related | prerequisite | sequel | contrast

tags: [go, concurrency]         # 标签
priority: 1                     # 规划优先级（1 最高）
planned_date: 2026-06-15         # 计划写作日期
blocked_by: [go-goroutine]      # 前置依赖
---
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 否 | 唯一标识，默认取文件名 |
| `title` | string | 是 | 显示标题 |
| `type` | enum | 否 | topic（默认）/ series / pillar |
| `status` | enum | 否 | idea（默认）/ outline / draft / published |
| `created` | date | 否 | 创建日期 |
| `published` | date | 否 | 发布日期 |
| `paths` | string[] | 否 | 层级路径，用 `/` 分隔 |
| `links` | object[] | 否 | 跨主题链接 |
| `tags` | string[] | 否 | 标签 |
| `priority` | number | 否 | 优先级，1 最高 |
| `planned_date` | date | 否 | 计划写作日期 |
| `blocked_by` | string[] | 否 | 前置主题 ID |

### Wiki 链接

正文中的 `[[主题ID]]` 或 `[[主题ID|显示文字]]` 会自动解析为链接关系，与 frontmatter 中的 `links` 合并。

---

## 层级定义 (taxonomy.yaml)

`taxonomy.yaml` 定义你的博客分类树：

```yaml
技术:
  后端:
    Go:
      - 并发
      - 性能
    Rust:
      - 所有权
  前端:
    React:
      - 状态管理

生活:
  阅读:
  旅行:
```

- 嵌套对象 = 分类节点
- 数组项 = 叶子分类
- 主题通过 frontmatter 的 `paths` 挂到任意节点
- 也可以在创建主题时自定义新路径，不必预先在 taxonomy 中定义

---

## Web 界面功能

### 1. 思维导图

- 基于 React Flow 的交互式图谱
- 分类节点（紫色）+ 主题节点（按状态着色）
- 层级边（实线）+ 跨级链接（虚线动画箭头）
- 支持缩放、平移、小地图
- 文件变更后自动刷新

**节点颜色：**
- 灰色虚线 = 想法 (idea)
- 橙色 = 大纲 (outline)
- 蓝色 = 草稿 (draft)
- 绿色 = 已发布 (published)

### 2. 写作规划

- 列出所有未发布主题
- 按优先级和计划日期排序
- 显示依赖关系 (blocked_by)
- 顶部显示重复检测警告

### 3. 时间线

- 已发布文章按发布日期排列
- 进行中主题（idea/outline/draft）卡片展示

### 4. 覆盖度

- 表格展示每个层级路径下的主题数量
- 按状态分列：已发布 / 草稿 / 大纲 / 想法
- 彩色进度条直观显示覆盖情况

### 5. 新建主题

- 表单创建新主题
- 选择已有路径或自定义新路径
- 创建后自动写入 `topics/` 并更新图谱

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/graph` | 获取内容图谱 |
| GET | `/api/topics` | 获取所有主题摘要 |
| GET | `/api/topics/:id` | 获取单个主题详情 |
| POST | `/api/topics` | 创建新主题 |
| GET | `/api/planning` | 获取写作规划列表 |
| GET | `/api/coverage` | 获取覆盖度统计 |
| GET | `/api/duplicates` | 获取重复检测警告 |
| GET | `/api/taxonomy/paths` | 获取所有可用路径 |
| POST | `/api/sync` | 手动触发图谱同步 |
| GET | `/api/events` | SSE 事件流（文件变更通知） |

---

## CLI 命令

```bash
# 启动开发环境（API + Web UI）
npm run dev

# 手动同步图谱
npm run sync

# 检查重复主题
npm run check

# 构建生产版本
npm run build
```

---

## 重复检测逻辑

系统会从三个维度检测可能的重复：

1. **标题相似度** — 字符级 Jaccard 相似度 ≥ 60%
2. **同路径冲突** — 同一路径下已有 published 主题，新主题为非 published
3. **标签重叠** — 两个主题有 ≥ 2 个相同标签

检测结果在「写作规划」页面顶部以警告形式展示。

---

## 扩展方向

### 近期可做
- [ ] 主题编辑功能（Web UI 内修改 frontmatter 和正文）
- [ ] 搜索功能
- [ ] 导出 Mermaid mindmap / Markmap HTML
- [ ] 拖拽调整节点位置并保存

### 中期
- [ ] 语义相似检测（embedding）
- [ ] 自然语言添加主题（"在 Go/并发 下加一个 worker pool 主题"）
- [ ] 写作统计仪表盘（字数、频率、热力图）
- [ ] Git 集成：从 commit 历史自动提取时间线

### 长期
- [ ] 多用户 / 协作
- [ ] 与 Obsidian / Notion 同步
- [ ] AI 辅助：根据已有内容推荐下一个该写的主题

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite + React Flow |
| 后端 | Express + TypeScript |
| 文件解析 | gray-matter (frontmatter) + js-yaml |
| 文件监听 | chokidar |
| 实时通信 | Server-Sent Events (SSE) |
| 内容格式 | Markdown + YAML frontmatter |

---

## 设计原则

1. **文件即数据库** — 所有内容存在 Markdown 文件中，Git 版本管理
2. **视图自动生成** — 思维导图、统计、规划列表都从文件推导，不手动维护
3. **最小输入** — 创建主题只需标题和路径，其余可选
4. **渐进增强** — MVP 用脚本 + Web UI，后续按需加功能
5. **本地优先** — 无需云服务，数据完全在本地
