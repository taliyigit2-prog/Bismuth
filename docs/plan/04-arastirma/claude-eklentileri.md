# Claude Code plugins, agents, skills and hooks for Hotel-CRM

Research report for the planning document. Date: 2026-10-01.

Sources (all fetched live during this research):

- `anthropics/claude-plugins-official` README, `.claude-plugin/marketplace.json` (315 entries) and a shallow clone of the repository (54 plugin directories under `plugins/` and `external_plugins/`; every `plugin.json`, `hooks.json`, `.mcp.json`, `commands/*.md`, `agents/*.md`, `skills/*/SKILL.md` was inspected).
- Claude Code docs: `plugins` (overview), `plugins/install`, `plugins/loading`, `plugins/org`, `plugin-marketplaces` (now "Create a marketplace"), `skills`, `sub-agents`, `hooks` (reference), `hooks-guide`, `memory` (CLAUDE.md), `settings-reference`, `security-guidance`.
- The Hotel-CRM repo itself: `docs/plan/01-gereksinimler.md` (requirements G-01..G-130), `docs/plan/02-excel-analizi.md`, empty `docs/plan/fazlar/` (phase files will live here, Turkish naming) and an empty `.claude/`.

## 0. Findings that shape the whole plan

1. **Hooks are the only hard enforcement.** The memory docs say it plainly: "Claude treats them [CLAUDE.md, rules] as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook." `PreToolUse` hooks fire in every permission mode, including `bypassPermissions`; a hook `deny` cannot be overridden by the model. So every "prohibition" (yasak) in this project should be a hook (deterministic script) or a `permissions.deny` rule; CLAUDE.md and `.claude/rules/` carry the reasoning and the softer conventions.
2. **Cloud sessions (claude.ai/code, the kind this research ran in) do not load marketplace plugins at all**, neither user-installed ones nor the ones a repository's `.claude/settings.json` turns on. They *do* load committed `.claude/settings.json` hooks, `.claude/agents/`, `.claude/skills/`, `.claude/rules/` and `CLAUDE.md`. Therefore the project-local files are the primary mechanism; marketplace plugins are an add-on for local terminal/desktop/VS Code sessions.
3. **Project-scope plugin enabling is cheap for Anthropic's in-repo plugins.** Entries whose marketplace `source` is a relative path (every `./plugins/*` and `./external_plugins/*` entry) load straight from the marketplace copy once `enabledPlugins` names them in `.claude/settings.json`; no per-machine `claude plugin install` is required. Plugins with an external git source (e.g. `superpowers`, `semgrep`, `sonarqube`) must be installed once per machine with `claude plugin install <name>@claude-plugins-official --scope project`.
4. **Every enabled plugin costs context on every turn** (its skill/agent names + descriptions). `pr-review-toolkit` ships six agents with long descriptions; `claude plugin details <name>` prints the always-on token cost. Enable deliberately; use `skillOverrides` to collapse noisy ones.
5. **Nothing in the marketplace is Electron/Tauri/SQLite-specific.** Relevant pieces are generic: `typescript-lsp`, `frontend-design`, `pr-review-toolkit`, `code-simplifier`, `security-guidance`, `commit-commands`, `feature-dev`, `hookify`, `claude-md-management`, `playwright` (MCP), `context7` (docs), `claude-security` (deep scan). The DB plugins are all hosted-SaaS connectors (Postgres/Mongo/BigQuery...), useless for a local SQLite file. Hotel-specific rules (Turkish copy, no-network, migrations, G-xx traceability) must be project-local.
6. **All in-repo plugins are Apache-2.0.** Their `SKILL.md`/agent files can be vendored into `.claude/` (keep the LICENSE text) so the same behaviour is available in cloud sessions and does not depend on a per-machine install. `frontend-design` and the `pr-review-toolkit` agents are the best candidates.
7. **Windows is a target platform (G-03).** Hook scripts should be Node (`node .claude/hooks/x.mjs`) rather than bash+jq, because hooks run under Git Bash on Windows and `jq` is usually absent; Node is guaranteed in an Electron/Tauri+React repo.

## 1. The marketplace: all 315 plugins by category

Totals from `marketplace.json`: development 123, productivity 69, database 39, monitoring 22, security 18, uncategorized 14, deployment 9, design 8, learning 3, automation 3, testing 2, math 2, location 2, migration 1. Sources: 53 relative paths (in repo), 164 `url` git repos, 98 `git-subdir`. Only 15 entries declare components inline in the manifest (all are `lspServers` for the `*-lsp` plugins, plus `skills`+`strict:false` for a few skill bundles); everything else is discovered from the plugin directory.

How to read the table: *Kind* says whether the plugin's files are in the official repo (Anthropic or a partner directory) or fetched from an external git repository at install time. *Installs / needs* is exact for in-repo plugins (taken from the clone) and a heuristic for external ones (hosted MCP/SaaS phrasing in the description means an account or internet is needed; "skills bundle" means markdown-only and usually offline-capable). Everything not mentioned in section 2 can be ignored for this project.

### automation (3)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `browser-use` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Give Claude a real browser — your Chrome or a Browser Use Cloud browser. Use it whenever a task involves a website or web app: browsing, scraping and data extraction, ... |
| `synthflow` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Connects Claude Code to the Synthflow AI voice-agent platform through its hosted MCP server, with skills for reviewing calls and auditing agent prompts, plus a docs-se... |
| `zyte-web-data` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Web scraping skills for Claude Code powered by the Zyte API — scrape sites, generate and run Scrapy spiders, define extraction schemas, and ship to Scrapy Cloud. |

### database (39)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `aiven` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Easily deploy managed PostgreSQL (pg), Kafka, OpenSearch, Clickhouse and other databases, streaming and apps. Free tier available, up and running in minutes. |
| `alloydb` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Create, connect, and interact with an AlloyDB for PostgreSQL database and data. |
| `alloydb-omni` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Create, connect, and interact with an AlloyDB Omni database and data. |
| `altimate-code` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Delegates dbt and warehouse work to altimate-code, a specialized CLI agent with 100+ purpose-built data tools (SQL analysis, column-level lineage, dbt build/test/run, ... |
| `azure-cosmos-db-assistant` | external: url | skills bundle; likely usable offline | Expert assistant for Azure Cosmos DB — data modeling, query optimization, performance tuning, and best practices. |
| `azure-sql-developer` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Agent skills for Azure SQL Developer, the Azure SQL Database engine running locally in a container. Teaches your agent to run the engine, connect, migrate, scaffold, b... |
| `bigdata-com` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Official Bigdata.com plugin providing financial research, analytics, and intelligence tools powered by Bigdata MCP. |
| `bigquery-data-analytics` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect, query, and generate data insights for BigQuery datasets and data. |
| `clickhouse` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect Claude to your ClickHouse Cloud databases. Browse organizations, services, databases, and table schemas. Run read-only SQL queries against your data and get in... |
| `clickhouse-best-practices` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | 28 best practice rules for ClickHouse schema design, query optimization, and data ingestion — prioritized by impact |
| `cloud-sql-mysql` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect and interact with a Cloud SQL for MySQL database and data. |
| `cloud-sql-postgresql` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Create, connect, and interact with a Cloud SQL for PostgreSQL database and data. |
| `cloud-sql-sqlserver` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect to Cloud SQL for SQL Server |
| `cockroachdb` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect Claude Code directly to your CockroachDB clusters for hands-on database work — explore schemas, write optimized SQL, debug queries, and manage distributed data... |
| `convex` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Official Convex plugin for Claude Code with bundled Convex skills, the convex-expert subagent for code-writing, a runtime-error monitor, and MCP access for backend dev... |
| `databases-on-aws` | external: git-subdir | skills bundle; likely usable offline | Expert database guidance for the AWS database portfolio. Design schemas, execute queries, handle migrations, and choose the right database for your workload. |
| `databricks` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Databricks skills for the CLI, Apps, Lakebase, Model Serving, Lakeflow Jobs, Spark Declarative Pipelines, Declarative Automation Bundles (DABs), and classic-to-serverl... |
| `datahub-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | DataHub development and interaction toolkit with connector planning, PR review, catalog search, metadata enrichment, lineage tracing, data quality management, and conn... |
| `dataproc` | external: url | skills bundle; likely usable offline | Manage Dataproc clusters and jobs. |
| `dataverse` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Agent skills for building on, analyzing, and managing Microsoft Dataverse — with Dataverse MCP, PAC CLI, and Python SDK. |
| `duckdb-skills` | external: url | skills bundle; likely usable offline | DuckDB-powered skills for Claude Code: read any data file, attach and query DuckDB databases, search DuckDB/DuckLake docs, search past session logs, and install/update... |
| `firebase` | partner (in repo) | Firebase MCP. Google account. Skip. | Google Firebase MCP integration. Manage Firestore databases, authentication, cloud functions, hosting, and storage. Build and manage your Firebase backend directly fro... |
| `firestore-native` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect and interact with Firestore databases, collections, and documents. |
| `informatica-for-claude-platform` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Governed catalog discovery for Informatica Intelligent Data Management Cloud (CDGC): find tables, columns, files, glossary terms and policies across the enterprise cat... |
| `knowledge-catalog` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect to Knowledge Catalog to discover, manage, monitor, and govern data and AI artifacts across your data platform |
| `looker` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect to Looker and interact with your data using LookML. |
| `mongodb` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Official Claude plugin for MongoDB (MCP Server + Skills). Connect to databases, explore data, manage collections, optimize queries, generate reliable code, implement b... |
| `mongodb-atlas` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Connect to MongoDB Atlas clusters only through the Atlas Managed MCP Server. Sign in with your Atlas account to explore data, manage collections, optimize queries, gen... |
| `neon` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Manage your Neon projects and databases with the neon-postgres agent skill and the Neon MCP Server. |
| `oracledb` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect, query, and interact with Oracle Databases and their data. |
| `pinecone` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Pinecone vector database integration. Streamline your Pinecone development with powerful tools for managing vector indexes, querying data, and rapid prototyping. Use s... |
| `planetscale` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | An authenticated hosted MCP server that accesses your PlanetScale organizations, databases, branches, schema, and Insights data. Query against your data, surface slow ... |
| `qdrant-skills` | external: url | skills bundle; likely usable offline | Agent skills for Qdrant vector search covering scaling, performance optimization, search quality, monitoring, deployment, model migration, version upgrades, and SDK us... |
| `redis-development` | external: git-subdir | skills bundle; likely usable offline | Redis development best practices — data structures, query engine, vector search, caching, and performance optimization |
| `sap-hana-cli` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | 150+ SAP HANA database tools for AI assistants. Query tables, import/export data, profile data quality, compare schemas, manage backups, monitor performance, and more.... |
| `spanner` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect and interact with Spanner data using natural language. |
| `supabase` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Supabase MCP integration for database operations, authentication, storage, and real-time subscriptions. Manage your Supabase projects, run SQL queries, and interact wi... |
| `vsql-extension-builder` | external: url | skills bundle; likely usable offline | Builds a VillageSQL extension for MySQL end-to-end through a 7-phase persona-driven workflow. Commonly used to port PostgreSQL extensions to MySQL. |
| `zilliz` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Zilliz Cloud management plugin with 14 skills covering cluster lifecycle, collection schema, vector search, index tuning, bulk import, RBAC, backups, and monitoring. |

### deployment (9)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `azure` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Transform Claude into an Azure expert. This plugin integrates the Azure MCP server and specialized Azure skills to move beyond generic advice. It enables Claude to per... |
| `cloudflare` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Skills for the Cloudflare developer platform: Workers, Durable Objects, Agents SDK, MCP servers, Wrangler CLI, and web performance. |
| `deploy-on-aws` | external: git-subdir | skills bundle; likely usable offline | Deploy applications to AWS with architecture recommendations, cost estimates, and IaC deployment. |
| `google-cloud-storage` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Official Google Cloud Storage (GCS) plugin. Manage buckets and objects, transfer data, and configure MCP, FUSE, IAM, security, lifecycle rules, signed URLs, Terraform,... |
| `hostinger` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Deploy, manage and monitor Hostinger services — Websites, Domains, Ecommerce, Email Marketing, Subscriptions & Payments, and VPS. Authenticate via browser (OAuth) or A... |
| `railway` | external: git-subdir | skills bundle; likely usable offline | Deploy and manage apps, databases, and infrastructure on Railway. Covers project setup, deploys, environment configuration, networking, troubleshooting, and monitoring. |
| `render` | external: url | skills bundle; likely usable offline | Deploy, debug, and monitor applications on Render. Includes skills, an agent, slash commands, and a render.yaml validation hook. |
| `valtown` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Build and deploy on Val Town. Bundles the Val Town MCP server and platform skills (HTTP vals, cron/intervals, SQLite, email, OAuth, React UI, third-party integrations,... |
| `vercel` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Vercel deployment platform integration. Manage deployments, check build status, access logs, configure domains, and control your frontend infrastructure directly from ... |

### design (8)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `adobe-for-creativity` | external: git-subdir | skills bundle; likely usable offline | Harness Adobe's creative AI-powered tools to edit images, automate design workflows, and bring creative visions to life — from background removal to vectorization and ... |
| `canva` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Create, edit, review, resize, and brand-check Canva designs with the Canva MCP server. |
| `figma` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Figma design platform integration. Access design files, extract component information, read design tokens, and translate designs into code. Bridge the gap between desi... |
| `hyperframes` | external: url | skills bundle; likely usable offline | HyperFrames by HeyGen. Write HTML, render video. Compositions, GSAP and runtime adapter animations, captions, voiceovers, audio-reactive visuals, and website-to-video ... |
| `miro` | external: git-subdir | skills bundle; likely usable offline | Secure access to Miro boards. Enables AI to read board context, create diagrams, and generate code with enterprise-grade security. |
| `runway-api` | external: url | skills bundle; likely usable offline | Video generation at scale. Generate videos, images, and audio with Runway's API — batch ad campaigns, product videos, multishot stories, and creative iteration. Suppor... |
| `superdesign` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Design or redesign frontend UI and marketing graphics on the Superdesign infinite canvas. Reads your codebase for context, sets up a design system, and generates branc... |
| `ui-theme-designer` | external: git-subdir | skills bundle; likely usable offline | Plugin for coding agents working with UI theme designer. Bundles two skills: how-to and conceptual answers about UI theme designer on BTP, and questions about the SAP ... |

### development (123)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `agent-sdk-dev` | Anthropic (in repo) | 1 command, 2 agents. Needs nothing external. | Development kit for working with the Claude Agent SDK |
| `agentforce-adlc` | external: url | skills bundle; likely usable offline | Agentforce Agent Development Life Cycle — author, discover, scaffold, deploy, test, and optimize .agent files |
| `airwallex-dev` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Build Airwallex payment integrations in your own codebase. Generates the checkout, card-element, onboarding, and subscription-billing code for an Airwallex integration... |
| `amd-skills` | external: git-subdir | skills bundle; likely usable offline | AMD's verified Agent Skills in one plugin: route image/audio through local AI on Ryzen AI, serve LLMs on AMD Instinct GPUs with vLLM, optimize inference throughput wit... |
| `apollo-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Apollo GraphQL agent skills for Claude Code — Apollo Client, Server, Federation, Connectors, Router, Rover CLI, iOS, Kotlin, and the Apollo MCP server. Covers schema d... |
| `appwrite` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Appwrite tools for Claude Code, including SDK skills, Appwrite MCP servers, and deployment commands. |
| `astronomer-data-agents` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Data engineering for Apache Airflow and Astronomer. Author DAGs with best practices, debug pipeline failures, trace data lineage, profile tables, migrate Airflow 2 to ... |
| `atomic-agents` | external: url | skills bundle; likely usable offline | Comprehensive development workflow for building AI agents with the Atomic Agents framework. Includes specialized agents for schema design, architecture planning, code ... |
| `aws-agents` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Build, deploy, and operate AI agents on AWS. Skills for scaffolding agents with Amazon Bedrock AgentCore, connecting tools, memory, policies, evaluation, debugging, an... |
| `aws-agents-for-devsecops` | external: git-subdir | skills bundle; likely usable offline | Investigate incidents, review code and execute UAT for release readiness, scan code for vulnerabilities, and run penetration tests with AWS DevOps Agent and AWS Securi... |
| `aws-amplify` | external: git-subdir | skills bundle; likely usable offline | Build full-stack apps with AWS Amplify Gen 2 using guided workflows for authentication, data models, storage, GraphQL APIs, and Lambda functions. |
| `aws-core` | external: git-subdir | skills bundle; likely usable offline | Build, deploy, and operate applications on AWS. Skills to author infrastructure-as-code, use core services, and complete common tasks. |
| `aws-data-analytics` | external: git-subdir | skills bundle; likely usable offline | Data lake, analytics, and ETL workflows with S3 Tables, AWS Glue, and Athena. |
| `aws-serverless` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Design, build, deploy, test, and debug serverless applications with AWS Serverless services. |
| `aws-startup-advisor` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Personalized AWS guidance built on patterns from 350,000+ startups. Get architecture, cost, and security recommendations matched to your stage, from day-one account se... |
| `base44` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Build and deploy Base44 full-stack apps with CLI project management and JavaScript/TypeScript SDK development skills |
| `boltz` | external: git-subdir | skills bundle; likely usable offline | Predict structures, screen molecules and proteins, and design binders with Boltz from Claude Code. |
| `buildkite` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Official Buildkite skills for Claude Code, Cursor, and other AI coding agents — pipelines, migration, preflight, agent runtime, CLI, and API |
| `catalyst-by-zoho` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Official Claude Code plugin for Catalyst by Zoho — full-stack serverless cloud platform. With Skills that covers all services, SDKs, CLI, architecture patterns, pricin... |
| `cds-mcp` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | AI-assisted development of SAP Cloud Application Programming Model (CAP) projects. Search CDS models and CAP documentation. |
| `chrome-devtools-mcp` | external: url | skills bundle; likely usable offline | Control and inspect a live Chrome browser from your coding agent. Record performance traces, analyze network requests, check console messages with source-mapped stack ... |
| `circle-skills` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Ship stablecoin apps faster. Best-practice skills for USDC payments, cross-chain transfers, wallets, and smart contracts — plus Circle's MCP server for real-time SDK a... |
| `ckeditor` | external: url | skills bundle; likely usable offline | Install, configure, and integrate CKEditor 5 (free and premium) in any JavaScript project. |
| `clangd-lsp` | Anthropic (in repo) | LSP server config only. Needs `clangd` on PATH. | C/C++ language server (clangd) for code intelligence |
| `code-modernization` | Anthropic (in repo) | 13 commands, 8 agents, hooks. Nothing external. | Guided modernization for any legacy codebase: start with /modernize, get an assessment, an interactive map, the business rules mined from the code, and a plan you appr... |
| `codspeed` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | CodSpeed is the all-in-one performance testing toolkit. Dive into benchmarking results, flamegraphs, and performance comparisons — give Claude granular profiling conte... |
| `confidence` | external: url | skills bundle; likely usable offline | Access Confidence feature flags, experiments, and migration tools directly from Claude Code. |
| `context7` | partner (in repo) | Hosted HTTP MCP (https://mcp.context7.com/mcp). Needs internet; anonymous works, CONTEXT7_API_KEY optional. | Upstash Context7 MCP server for up-to-date documentation lookup. Connects to Context7's hosted remote MCP server (https://mcp.context7.com/mcp) — no local Node.js or n... |
| `csharp-lsp` | Anthropic (in repo) | LSP config. Needs C# language server binary. | C# language server for code intelligence |
| `data` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Data engineering for Apache Airflow and Astronomer. Author DAGs with best practices, debug pipeline failures, trace data lineage, profile tables, migrate Airflow 2 to ... |
| `data-agent-kit-starter-pack` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | This plugin provides a specialized suite of skills for data engineers and database practitioners working on Google Cloud. It acts as an expert assistant, allowing you ... |
| `datarobot-agent-skills` | external: url | skills bundle; likely usable offline | DataRobot skills for AI/ML workflows — model training, deployment, predictions, feature engineering, monitoring, explainability, data preparation, App Framework CI/CD,... |
| `deepeval` | external: url | skills bundle; likely usable offline | Skills for adding DeepEval evaluations, tracing, datasets, Confident AI reports, and iterative improvement loops to AI applications. |
| `dominodatalab` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Full Domino Data Lab platform support — workspaces, jobs, model deployment, experiment tracking, GenAI tracing, Spark/Ray/Dask, and app deployment for data science teams |
| `expo` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Official Expo skills for building, deploying, upgrading, and debugging React Native apps with Expo. Covers UI development with Expo Router, SwiftUI and Jetpack Compose... |
| `fakechat` | partner (in repo) | Localhost MCP for channel testing. Skip. | Localhost web chat for testing the channel notification flow. No tokens, no access control, no third-party service. |
| `feature-dev` | Anthropic (in repo) | 1 command `/feature-dev`, 3 agents (code-explorer, code-architect, code-reviewer; sonnet). Nothing external. | Comprehensive feature development workflow with specialized agents for codebase exploration, architecture design, and quality review |
| `firecrawl` | external: url | skills bundle; likely usable offline | Web scraping and crawling powered by Firecrawl. Turn any website into clean, LLM-ready markdown or structured data. Scrape single pages, crawl entire sites, search the... |
| `forge-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Forge-focused skills and MCP configuration for Atlassian Forge: scaffold and deploy apps (forge create, templates, dev spaces), build Teamwork Graph connectors for Rov... |
| `frontend-design` | Anthropic (in repo) | 1 skill. Nothing external. | Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics. |
| `gitkraken` | external: url | skills bundle; likely usable offline | Gives Claude access to your real Git and project context: commits, branches, pull requests, and issues across every repo you work in. Works with GitHub, GitLab, Azure ... |
| `gopls-lsp` | Anthropic (in repo) | LSP config. Needs `gopls`. | Go language server for code intelligence and refactoring |
| `greptile` | external: git-subdir | skills bundle; likely usable offline | AI code review agent for GitHub and GitLab. View and resolve Greptile's PR review comments, run reviews on your working branch, and search your organization's knowledg... |
| `huggingface-skills` | external: url | skills bundle; likely usable offline | Build, train, evaluate, and use open source AI models, datasets, and spaces. |
| `idmp-plugin` | external: git-subdir | skills bundle; likely usable offline | TDengine IDMP plugin with packaged skills for discovery, schema inspection, and safe operational workflows. |
| `jdtls-lsp` | Anthropic (in repo) | LSP config. Needs Eclipse JDT.LS. | Java language server (Eclipse JDT.LS) for code intelligence |
| `kotlin-lsp` | Anthropic (in repo) | LSP config. Needs Kotlin LS. | Kotlin language server for code intelligence |
| `laravel-boost` | partner (in repo) | Laravel MCP. Skip. | Laravel development toolkit MCP server. Provides intelligent assistance for Laravel applications including Artisan commands, Eloquent queries, routing, migrations, and... |
| `liquid-lsp` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | LSP integration for Shopify Liquid templates via the Shopify CLI theme language server. |
| `liquid-skills` | external: git-subdir | skills bundle; likely usable offline | Liquid language fundamentals, CSS/JS/HTML coding standards, and WCAG accessibility patterns for Shopify themes |
| `lovable` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Build, iterate on, deploy, and manage Lovable apps from Claude Code. Bundles the official Lovable MCP server (remote, OAuth 2.1) and adds focused commands for the comm... |
| `lua-lsp` | Anthropic (in repo) | LSP config. Needs lua-language-server. | Lua language server for code intelligence |
| `lumen` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Precise local semantic code search via MCP. Indexes your codebase with Go AST parsing, embeds with Ollama or LM Studio, and exposes vector search to Claude through an ... |
| `mattpocock-skills` | external: url | skills bundle; likely usable offline | Matt Pocock's agent skills for real engineering — grilling, spec/ticket flows, TDD, code review, domain modelling and more. Plug-and-play, not vibe coding. |
| `mcp-apps` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Skills for creating MCP Apps with the MCP Apps SDK |
| `mcp-server-dev` | Anthropic (in repo) | 3 skills. Only for building MCP servers. | Skills for designing and building MCP servers that work seamlessly with Claude. Guides you through deployment models (remote HTTP, MCPB, local), tool design patterns, ... |
| `mcp-tunnels` | Anthropic (in repo) | 1 command. Needs Docker, cloudflared, Anthropic tunnel. Skip. | Connect Claude to a private MCP server through an Anthropic MCP tunnel. The /create-docker-mcp-tunnel command drives the Docker Compose quickstart end to end: certific... |
| `mercadopago` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Mercado Pago full-product integration toolkit. One agent routes to four orchestration skills (mp-integrate wizard, mp-webhooks, mp-test-setup, mp-review) that pull eve... |
| `mergify` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Skills for the Mergify CLI: manage merge queues, stacked pull requests, Test Insights (flaky tests, quarantine), merge protections, and Mergify configuration directly ... |
| `microsoft-docs` | external: url | skills bundle; likely usable offline | Access official Microsoft documentation, API references, and code samples for Azure, .NET, Windows, and more. |
| `migration-to-aws` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Plan a migration from Google Cloud Platform (and OpenAI/Gemini AI workloads) to AWS. Analyzes your Infrastructure-as-Code files, app code, and GCP billing data to disc... |
| `mintlify` | external: url | skills bundle; likely usable offline | Build beautiful documentation sites with Mintlify. Convert non-markdown files into properly formatted MDX pages, add and modify content with correct component use, and... |
| `modern-web-guidance` | external: url | skills bundle; likely usable offline | Keep your coding agent up to date with the latest web best practices |
| `netlify-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Netlify platform skills for Claude Code — functions, edge functions, blobs, database, image CDN, forms, config, CLI, frameworks, caching, AI gateway, and deployment. |
| `netsuite-suitecloud` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Develop NetSuite SuiteCloud solutions with SuiteScript, SDF, and best practices: SuiteScript records and upgrades, SDF objects, roles and permissions, UIF single-page ... |
| `nvidia-skills` | external: git-subdir | skills bundle; likely usable offline | Find the right NVIDIA skill for GPU acceleration, CUDA, AI agents, data loading, training, inference, robotics, Physical AI, Omniverse, simulation, and other NVIDIA-po... |
| `oracle-ai-data-platform-workbench-databricks-migrator` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Drive the Oracle AI Data Platform (AIDP) Databricks Migration Toolkit in natural language. Plans and executes automated Databricks → AIDP migrations of notebooks, jobs... |
| `oracle-ai-data-platform-workbench-engineer-agent` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Oracle AI Data Platform (AIDP) Workbench engineer agent for Claude Code — a 37-skill agent that operates the full Spark/Delta lakehouse in natural language. Discovers ... |
| `oracle-ai-data-platform-workbench-spark-connectors` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Oracle AI Data Platform Workbench Spark connectors for Claude Code. 18 connector skills covering every data source workbench customers commonly need: Oracle Autonomous... |
| `outputai` | external: git-subdir | skills bundle; likely usable offline | Output.ai workflow development toolkit for Claude Code. Adds 5 specialist agents (planner, builder, debugger, prompt writer, quality reviewer), 40+ slash-command skill... |
| `paypal` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | PayPal development plugin for Claude — integrate payments, subscriptions, invoices, disputes, and more using PayPal's APIs and MCP server |
| `php-lsp` | Anthropic (in repo) | LSP config. Needs Intelephense. | PHP language server (Intelephense) for code intelligence |
| `pixeltable` | external: url | skills bundle; likely usable offline | Build multimodal AI applications with Pixeltable -- tables, computed columns, embedding search, UDFs, tool-calling agents, and 25+ AI provider integrations. |
| `playground` | Anthropic (in repo) | 1 skill (HTML playgrounds). Nothing external. | Creates interactive HTML playgrounds — self-contained single-file explorers with visual controls, live preview, and prompt output with copy button. Includes templates ... |
| `plugin-dev` | Anthropic (in repo) | 1 command, 7 skills, 3 agents. Nothing external; only for authoring plugins. | Comprehensive toolkit for developing Claude Code plugins. Includes 7 expert skills covering hooks, MCP integration, commands, agents, and best practices. AI-assisted p... |
| `postman` | external: url | skills bundle; likely usable offline | Work with Postman from your agent: bootstrap a repo's Postman setup, mock an API before it's implemented, run collection and governance checks in CI, monitor a live en... |
| `preset-cli-skills` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Preset CLI skills for explicit shell, scripting, and CI/CD workflows driven by the `sup` CLI (PyPI package `superset-sup`). Use only for CLI workflows; do not use for ... |
| `pydantic-ai` | external: git-subdir | skills bundle; likely usable offline | Write accurate Pydantic AI code from the start. Up-to-date patterns, decision trees, and common gotchas for agents, tools, structured output, streaming, and multi-agen... |
| `pyright-lsp` | Anthropic (in repo) | LSP config. Needs pyright. | Python language server (Pyright) for type checking and code intelligence |
| `qodo` | external: git-subdir | skills bundle; likely usable offline | Bring Qodo's codebase intelligence, coding standards, and code review into your coding agent. |
| `qodo-standards` | external: git-subdir | skills bundle; likely usable offline | Optional Qodo rules discovery and standards administration workflows. |
| `qt-development-skills` | external: url | skills bundle; likely usable offline | Agentic engineering skills for Qt software development — Qt C++/QML code review, QML coding, and Qt C++/QML code documentation. |
| `quarkus-agent` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | MCP server for AI coding agents to create, manage, and interact with Quarkus applications. Provides tools for project scaffolding, dev mode lifecycle, extension skills... |
| `ralph-loop` | Anthropic (in repo) | 3 commands, Stop hook (bash). Nothing external. | Interactive self-referential AI loops for iterative development, implementing the Ralph Wiggum technique. Claude works on the same task repeatedly, seeing its previous... |
| `rc` | external: url | skills bundle; likely usable offline | Configure RevenueCat projects, apps, products, entitlements, and offerings directly from Claude Code. Manage your in-app purchase backend without leaving your developm... |
| `resend` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Agent skills for working with Resend to send and receive emails — email API integration, agent inbox, CLI, React Email components, and deliverability best practices. I... |
| `revenuecat` | external: url | skills bundle; likely usable offline | Configure RevenueCat projects, apps, products, entitlements, and offerings directly from Claude Code. Manage your in-app purchase backend without leaving your developm... |
| `rill` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Skills for developing and querying projects in the Rill business intelligence platform |
| `ruby-lsp` | Anthropic (in repo) | LSP config. Needs ruby-lsp. | Ruby language server for code intelligence and analysis |
| `rust-analyzer-lsp` | Anthropic (in repo) | LSP config. Needs rust-analyzer. | Rust language server for code intelligence and analysis |
| `sagemaker-ai` | external: git-subdir | skills bundle; likely usable offline | Build, train, and deploy AI models with deep AWS AI/ML expertise brought directly into your coding assistants, covering the surface area of Amazon SageMaker AI. |
| `salesforce-development` | external: git-subdir | skills bundle; likely usable offline | Build Salesforce apps and agents using these core building blocks: metadata, Apex, deploy/retrieve, security, reporting, and generated installed-versus-available capab... |
| `sanity` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Sanity content platform integration with MCP server, agent skills, and slash commands. Query and author content, build and optimize GROQ queries, design schemas, and s... |
| `sap-cds-mcp` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | AI-assisted development of SAP Cloud Application Programming Model (CAP) projects. Search CDS models and CAP documentation. |
| `sap-fiori-mcp-server` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | MCP server for SAP Fiori development tools for Claude Code. Build and modify SAP Fiori applications with AI assistance. |
| `sap-mdk-server` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | MCP server for SAP Mobile Development Kit (MDK). Build and modify MDK applications with AI assistance — schema lookups, action validation, rule editing, and project sc... |
| `scandit-sdk` | external: url | skills bundle; likely usable offline | AI agent skills for integrating the Scandit Data Capture SDK — product selection, documentation, and implementation guides for barcode scanning, ID capture, and smart ... |
| `serena` | partner (in repo) | stdio MCP via `uvx --from git+https://github.com/oraios/serena`. Needs `uv`; one-time download. Overlaps with typescript-lsp. | Semantic code analysis MCP server providing intelligent code understanding, refactoring suggestions, and codebase navigation through language server protocol integration. |
| `servicenow-sdk` | external: git-subdir | skills bundle; likely usable offline | Create, edit, and deploy ServiceNow applications with the Fluent SDK effortlessly through Claude AI. |
| `setup-agent-analytics` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Detect AI agents in your codebase and instrument them with Pendo Agent Analytics via the best-fit path: Python SDK, TypeScript SDK, client-side trackAgent(), or the Co... |
| `setup-mcp-agent-analytics` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Detect an MCP server's language (Python, TypeScript or Go) and instrument it with the matching Pendo SDK so MCP tool calls flow into Pendo Agent Analytics. |
| `shopify-ai-toolkit` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Shopify's AI Toolkit provides 18 development skills for building on the Shopify platform, covering documentation search, API schema access, GraphQL and Liquid code val... |
| `skill-creator` | Anthropic (in repo) | 1 skill with eval scripts/agents. Needs python3. | Create new skills, improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, update or optimize an existing skill, ru... |
| `snowflake-cortex-code` | external: git-subdir | skills bundle; likely usable offline | Automatically route Snowflake prompts from Claude Code to Cortex Code for execution. Provides slash commands for code review and task delegation, plus skills for routi... |
| `sourcegraph` | external: url | skills bundle; likely usable offline | Code search and understanding across codebases. Search, read, and trace references across repositories; analyze refactor impact; investigate incidents via commit and d... |
| `streaming-skills-plugin` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Skills for streaming application developers, covering Kafka and Flink client libraries and Schema Registry |
| `stripe` | external: git-subdir | skills bundle; likely usable offline | Stripe development plugin for Claude |
| `sumup` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | SumUp payment integrations across terminal and online checkout flows. Build Android and iOS POS apps with SumUp card readers, online checkout with server SDKs and the ... |
| `superpowers` | external: url | skills bundle; likely usable offline | Superpowers teaches Claude brainstorming, subagent driven development with built in code review, systematic debugging, and red/green TDD. Additionally, it teaches Clau... |
| `swift-lsp` | Anthropic (in repo) | LSP config. Needs SourceKit-LSP. | Swift language server (SourceKit-LSP) for code intelligence |
| `tavily` | external: url | skills bundle; likely usable offline | Build AI applications with real-time web data using Tavily's search, extract, crawl, and research APIs. |
| `teamcity-cli` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Agent skill for interacting with TeamCity CI/CD using the teamcity CLI. Enables Claude to explore builds, view logs, start jobs, manage queues, agents, and more. |
| `terraform` | partner (in repo) | Terraform MCP. Skip. | The Terraform MCP Server provides seamless integration with Terraform ecosystem, enabling advanced automation and interaction capabilities for Infrastructure as Code (... |
| `togetherai-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Agent Skills for Together AI platform — inference, training, embeddings, audio, video, images, function calling, and infrastructure. Covers serverless chat completions... |
| `twilio-developer-kit` | external: url | skills bundle; likely usable offline | Twilio Skills provide procedural knowledge for AI coding agents — which APIs to use, in what order, and what to avoid. Covers SMS, Voice, WhatsApp, Verify, SendGrid, C... |
| `typescript-lsp` | Anthropic (in repo) | LSP config (`typescript-language-server --stdio` for .ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs). Needs `npm i -g typescript-language-server typescript` (one-time download). | TypeScript/JavaScript language server for enhanced code intelligence |
| `ui5` | external: git-subdir | skills bundle; likely usable offline | SAPUI5 / OpenUI5 plugin for coding agents. Create and validate UI5 projects, access API documentation, run UI5 linter, get development guidelines and best practices fo... |
| `ui5-modernization` | external: git-subdir | skills bundle; likely usable offline | Complete UI5 modernization toolkit with workflow and specialized fix patterns for modernizing SAPUI5/OpenUI5 applications. |
| `ui5-typescript-conversion` | external: git-subdir | skills bundle; likely usable offline | SAPUI5 / OpenUI5 plugin for coding agents. Convert JavaScript based UI5 projects to TypeScript. |
| `unity` | external: url | skills bundle; likely usable offline | Unity's official plugin for Claude Code, with curated skills for game development, monetization, and performance optimization. |
| `unreal-engine-skills-for-claude-code` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Control Unreal Editor directly from Claude Code via MCP. Hundreds of tools exposed via Unreal's ToolsetRegistry across 30+ toolsets: actors, blueprints, materials, Nia... |
| `wix` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Build, manage, and deploy Wix sites and apps. CLI development skills for dashboard extensions, backend APIs, site widgets, and service plugins with the Wix Design Syst... |
| `zoom-plugin` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Claude plugin for planning, building, and debugging Zoom integrations across REST APIs, SDKs, webhooks, bots, and MCP workflows. |

### learning (3)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `explanatory-output-style` | Anthropic (in repo) | SessionStart hook injecting instructions. Nothing external; costs tokens every session. | Adds educational insights about implementation choices and codebase patterns (mimics the deprecated Explanatory output style) |
| `learn-with-coursera` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Turn any learning intent into a personalized Coursera experience. Asks three quick questions (topic, familiarity, preferred format), searches Coursera's catalog, and d... |
| `learning-output-style` | Anthropic (in repo) | SessionStart hook. Nothing external; token cost. | Interactive learning mode that requests meaningful code contributions at decision points (mimics the unshipped Learning output style) |

### location (2)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `amazon-location-service` | external: git-subdir | skills bundle; likely usable offline | Guide developers through adding maps, places search, geocoding, routing, and other geospatial features with Amazon Location Service, including authentication setup, SD... |
| `mapbox` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Mapbox skills and MCP servers for building location-aware applications with AI. Includes geospatial tools, style management, and patterns for web, iOS, Android, and AI... |

### math (2)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `math-olympiad` | Anthropic (in repo) | 1 skill. Not relevant. | Solve competition math (IMO, Putnam, USAMO) with adversarial verification that catches what self-verification misses. Fresh-context verifiers attack proofs with specif... |
| `math-proof` | Anthropic (in repo) | 2 skills, 3 agents. Not relevant. | Two skills for hard mathematics problems, each ending in a self-contained proof.md: /math-proof:solo has the session work the problem itself in stages with a notes fil... |

### migration (1)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `aws-transform` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Migrate, modernize, and upgrade codebases to AWS. Transforms .NET Framework to .NET 8/10, mainframe COBOL to Java, VMware VMs to EC2, SQL Server to Aurora, and upgrade... |

### monitoring (22)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `amplitude` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Use Amplitude as an expert analyst — instrument Amplitude, discover product opportunities, analyze charts, create dashboards, manage experiments, and understand users ... |
| `dash0` | external: url | skills bundle; likely usable offline | OpenTelemetry observability for Claude Code sessions. Captures tool calls, LLM invocations, token usage, and errors as OTel traces. Send telemetry to Dash0 or any Open... |
| `datadog` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Use Datadog directly in Claude Code through a preconfigured Datadog MCP server. Query logs, metrics, traces, dashboards, and more through natural conversation. This pl... |
| `fullstory` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect Claude to Fullstory to query behavioral analytics, session replays, and customer experience insights. |
| `grafana-assistant` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Skills and rules for developing and using the Grafana Assistant app and CLI. |
| `grafana-cloud-mcp` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Hosted MCP server for AI-assisted Grafana Cloud observability — no local installation required. |
| `grafana-mcp` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | MCP server for AI-assisted Grafana dashboard, datasource, alerting, and incident management. |
| `honeycomb` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Skills, agents, and workflows for Honeycomb observability — query patterns, production investigations, SLOs, OpenTelemetry instrumentation, and Beeline migration. Desi... |
| `incident-io` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Work with incident.io from Claude: respond to and investigate incidents, check on-call schedules and escalations, and author the runbooks, skills and architecture docs... |
| `langfuse-observability` | external: url | skills bundle; likely usable offline | Langfuse observability plugin for Claude Code — captures and exports traces, spans, and session telemetry from Claude Code to Langfuse for LLM monitoring, debugging, a... |
| `logfire` | external: git-subdir | skills bundle; likely usable offline | Add Logfire observability to Python applications with auto-instrumentation for FastAPI, httpx, asyncpg, SQLAlchemy, and more |
| `logrocket` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Connect Claude Code to LogRocket to query session replays, metrics, issues, and user behavior using natural language. |
| `mlflow` | external: url | skills bundle; likely usable offline | Skills for tracing, evaluating, and improving AI agents with MLflow. Supports the full agent improvement loop: instrument → trace → evaluate → iterate → validate. |
| `newrelic` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | New Relic observability intelligence for Claude Code. Investigate APM performance, analyze cloud costs, debug Kubernetes, write NRQL queries, and respond to alerts — a... |
| `noibu` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Built for ecommerce, the Noibu plugin bridges the gap between customer experience and revenue by connecting Claude directly to your store's session, error, and convers... |
| `pagerduty` | external: url | skills bundle; likely usable offline | Enhance code quality and security through PagerDuty risk scoring and incident correlation. Score pre-commit diffs against historical incident data and surface deployme... |
| `posthog` | external: url | skills bundle; likely usable offline | Access PostHog analytics, feature flags, experiments, error tracking, and insights directly from Claude Code. |
| `rootly` | external: url | skills bundle; likely usable offline | Full-lifecycle incident management: deploy safety, incident response, on-call management, and retrospectives. |
| `sentry` | external: url | skills bundle; likely usable offline | Sentry error monitoring integration. Access error reports, analyze stack traces, search issues by fingerprint, and debug production errors directly from your developme... |
| `sentry-cli` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Skills for using the Sentry CLI to interact with Sentry from the command line |
| `langfuse` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Skills for working with Langfuse, the open-source LLM engineering platform for tracing, prompt management, and evaluation. |
| `dynatrace` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Dynatrace observability skills: DQL query patterns, application and infrastructure monitoring, log analysis, problem investigation, and incident response workflows, wi... |

### productivity (69)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `airtable` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Airtable is the database and operations layer for your agents — whether running product, marketing, sales, ops, HR, or a custom business app. It combines structured da... |
| `airwallex-agentos` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Bring Airwallex's global financial infrastructure to Claude. Orchestrate actions across your account in plain language, e.g., set up invoices from a PO, onboard suppli... |
| `apollo` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Prospect, enrich leads, load outreach sequences, and query sales analytics with Apollo.io — one-click MCP server integration for Claude Code and Cowork. |
| `asana` | partner (in repo) | 1 command + Asana MCP (OAuth). Needs Asana account/internet. | Asana project management integration. Connects Claude Code to Asana's V2 MCP server to create and manage tasks, search projects, update assignments, and track progress... |
| `atlassian` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect to Atlassian products including Jira and Confluence. Search and create issues, access documentation, manage sprints, and integrate your development workflow wi... |
| `atlassian-twg-cli` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Teamwork Graph CLI is Atlassian's agent-first interface to your entire work context: Jira issues, Confluence pages, Bitbucket PRs, along with your connected third-part... |
| `blackrock-advisor-center-plugin` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | BlackRock Advisor Center 360° skills for financial advisors: portfolio review, opportunity and fund-health checks, guided benchmark selection, guided portfolio buildin... |
| `box` | external: url | skills bundle; likely usable offline | Work with your Box content directly from Claude Code — search files, organize folders, collaborate with your team, and use Box AI to answer questions, summarize docume... |
| `carbone-skill` | external: url | skills bundle; likely usable offline | Official Carbone skill — complete templating language reference covering tags, loops, conditions, formatters, aggregators, and all output formats (DOCX, XLSX, PPTX, OD... |
| `carta-cap-table` | external: git-subdir | skills bundle; likely usable offline | Carta Cap Table plugin — skills and hooks for querying cap tables, grants, SAFEs, 409A valuations, waterfall scenarios, and more |
| `carta-crm` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Manage the Carta CRM conversationally — search, add, update, and enrich investors, companies, contacts, deals, notes, and fundraisings via the Carta CRM MCP Server. |
| `carta-investors` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Carta Investors plugin — skills for querying investor data, performance benchmarks, regulatory reporting, AGM deck generation, brand extraction, and more via the Carta... |
| `chronograph-gp` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Portfolio monitoring, valuations and analytics for private-capital GP teams using the Chronograph connector: portfolio-company one-pagers, fund quarterly review packs,... |
| `chronograph-lp` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Portfolio monitoring and analytics for private-capital LP teams using the Chronograph connector: cashflow forecasting, commitment pacing, look-through exposure scans a... |
| `circleback` | external: url | skills bundle; likely usable offline | Circleback conversational context integration. Search and access meetings, emails, calendar events, and more. |
| `claude-code-setup` | Anthropic (in repo) | 1 read-only skill (automation recommender). Nothing external. | Analyze codebases and recommend tailored Claude Code automations such as hooks, skills, MCP servers, and subagents. |
| `claude-md-management` | Anthropic (in repo) | 1 command `/revise-claude-md`, 1 skill `claude-md-improver`. Nothing external. | Tools to maintain and improve CLAUDE.md files - audit quality, capture session learnings, and keep project memory current. |
| `clay` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Work with Clay from Claude Code: set up and sign in to the clay CLI, query and analyze Clay tables, search Clay's GTM database for people and companies, manage audienc... |
| `code-review` | Anthropic (in repo) | 1 command `/code-review`. Needs `gh` CLI + a GitHub PR (internet/GitHub account). | Automated code review for pull requests using multiple specialized agents with confidence-based scoring to filter false positives |
| `code-simplifier` | Anthropic (in repo) | 1 agent (opus). Nothing external. | Agent that simplifies and refines code for clarity, consistency, and maintainability while preserving functionality. Focuses on recently modified code. |
| `coderabbit` | external: url | skills bundle; likely usable offline | Your code review partner. CodeRabbit provides external validation using a specialized AI architecture and 40+ integrated static analyzers—offering a different perspect... |
| `commit-commands` | Anthropic (in repo) | 3 commands (`/commit`, `/commit-push-pr`, `/clean_gone`). Needs git; `gh` for PR. | Commands for git commit workflows including commit, push, and PR creation |
| `cwc-makers` | Anthropic (in repo) | 1 command, 2 skills. Needs Cardputer hardware. Skip. | Onboard a Code-with-Claude Makers Cardputer with one /maker-setup command — clones the build-with-claude repo, flashes UIFlow firmware, and installs the Claude Buddy a... |
| `desktop-commander` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | MCP server for terminal commands, process management, and file operations across text, code, PDF, DOCX, Excel, images, and structured data. |
| `discord` | partner (in repo) | MCP + 2 skills. Discord bot token. Skip. | Discord messaging bridge with built-in access control. Manage pairing, allowlists, and policy via /discord:access. |
| `dropbox` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | The Dropbox plugin for Claude connects your Dropbox files directly to Claude, so you can search, organize, save generated content, and create sharing links without swi... |
| `exa` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Exa AI web search, deep research, and content extraction. Provides MCP tools and research skills for comprehensive web search, people discovery, company research, acad... |
| `gc-ai` | external: url | skills bundle; likely usable offline | Work in your GC AI legal knowledge base from Claude: upload documents, run review playbooks, and ask questions grounded in your own files, all as you. |
| `github` | partner (in repo) | Hosted HTTP MCP (api.githubcopilot.com). Needs GITHUB_PERSONAL_ACCESS_TOKEN + internet. `gh` CLI covers the same needs. | Official GitHub MCP server for repository management. Create issues, manage pull requests, review code, search repositories, and interact with GitHub's full API direct... |
| `gitlab` | partner (in repo) | GitLab MCP. Token. Skip. | GitLab DevOps platform integration. Manage repositories, merge requests, CI/CD pipelines, issues, and wikis. Full access to GitLab's comprehensive DevOps lifecycle tools. |
| `govtribe` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Government contracting research and capture workflows in Claude: opportunity and pipeline briefs, bid/no-bid and competitor analysis, price-to-win and proposal prep, p... |
| `hookify` | Anthropic (in repo) | 4 commands, 1 skill, 1 agent, hooks on PreToolUse/PostToolUse/Stop/UserPromptSubmit (python3 scripts). Needs python3 (stdlib only). Rules live in `.claude/hookify.*.local.md`. | Easily create custom hooks to prevent unwanted behaviors by analyzing conversation patterns or from explicit instructions. Define rules via simple markdown files. |
| `hunter` | external: url | skills bundle; likely usable offline | Find and verify professional email addresses, search contacts by domain, and enrich company data -- directly in Claude. |
| `imessage` | partner (in repo) | MCP + 2 skills, macOS only. Skip. | iMessage messaging bridge with built-in access control. Reads chat.db directly, sends via AppleScript. Manage pairing, allowlists, and policy via /imessage:access. |
| `intercom` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Intercom integration for Claude Code. Search conversations, analyze customer support patterns, look up contacts and companies, and install the Intercom Messenger. Conn... |
| `intuit-quickbooks` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | QuickBooks business insights and actions: financial health briefings across P&L, cash flow, balance sheet and A/R, industry benchmarking, payroll cost analysis, overdu... |
| `leadfeeder` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Turn website visitor signals into pipeline with Leadfeeder: daily visitor briefs, visitor company research, buyer and contact discovery, personalised outreach drafts, ... |
| `legalzoom` | external: git-subdir | skills bundle; likely usable offline | Attorney guidance and legal tools for business and personal needs. AI-powered document review identifies critical risks and important clauses, advises when to engage a... |
| `linear` | partner (in repo) | Linear MCP. Account. Skip. | Linear issue tracking integration. Create issues, manage projects, update statuses, search across workspaces, and streamline your software development workflow with Li... |
| `linq-alpha` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | LinqAlpha financial research in Claude: guided setup for the LinqAlpha connector, capability-based source selection for fundamentals, estimates, transcripts, filings a... |
| `lusha` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Prospect, enrich, and build call-ready lead lists using Lusha's B2B intelligence platform — verified phone numbers, company signals, and lookalike targeting. |
| `monday-crm` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Run your monday CRM in plain language. Build a pipeline from scratch, start the day with a ranked deal briefing, spin up a forecast dashboard, audit board health, clea... |
| `netsuite-ai-companion` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Guides AI assistants that use the NetSuite AI Connector: tool-selection order, output formatting, NetSuite domain knowledge, multi-subsidiary and currency handling, an... |
| `netsuite-finance-analyst` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Director-level finance analysis on live NetSuite data: financial reporting, period close, variance, aging and reconciliation reviews, cash reporting, and board-ready n... |
| `notion` | external: url | skills bundle; likely usable offline | Notion workspace integration. Search pages, create and update documents, manage databases, and access your team's knowledge base directly from Claude Code for seamless... |
| `pendo-analytics` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Bring Pendo product analytics into Claude Code: account health, feature adoption, session replay lookup and triage, feedback analysis, and data-informed planning groun... |
| `pendo-guides` | external: git-subdir | skills bundle; likely usable offline | Create production-ready Pendo in-app guides (walkthroughs, announcements, alerts, polls, promotions) as HTML/CSS/JS from a short intake conversation, using Pendo's gui... |
| `pendo-orchestrate` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Create, configure and edit draft Pendo Orchestrate email journeys, including multi-email and conditional split flows, via the Pendo connector. Journeys stay in draft; ... |
| `pigment` | external: url | skills bundle; likely usable offline | Analyze business data and build custom Pigment models, metrics, and boards through natural language. |
| `pr-review-toolkit` | Anthropic (in repo) | 1 command, 6 agents (code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer). Nothing external. | Comprehensive PR review agents specializing in comments, tests, error handling, type design, code quality, and code simplification |
| `project-artifact` | Anthropic (in repo) | 1 skill. Publishes a claude.ai artifact (internet). | Generate and publish a living project status page — overview & success criteria, the workstream sequence, and next steps — as a shareable claude.ai artifact backed by ... |
| `receipts` | Anthropic (in repo) | 1 skill; reads local ~/.claude transcripts. | A personal Claude Code impact report for justifying your usage to a manager or a self-review: what you shipped, which projects it went to, and each project's share of ... |
| `save-to-spotify` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Create polished audio episodes with TTS narration, rich timelines, cover images, and save them to Spotify via the save-to-spotify CLI. |
| `session-report` | Anthropic (in repo) | 1 skill; reads local transcripts. | Generate an explorable HTML report of Claude Code session usage — tokens, cache efficiency, subagents, skills, and the most expensive prompts — from local ~/.claude/pr... |
| `shippo` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Shippo connects you to USPS, UPS, FedEx, DHL, and 40+ carriers, so you can handle a shipment end to end right inside Claude. Compare live rates and pick the cheapest o... |
| `slack` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Slack workspace integration. Search messages, access channels, read threads, and stay connected with your team's communications while coding. Find relevant discussions... |
| `spotify-ads-api` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Manage Spotify ad campaigns with natural language. Create campaigns, ad sets, ads, pull reports, and handle OAuth — all through conversation. |
| `telegram` | partner (in repo) | MCP + 2 skills. Bot token. Skip. | Telegram messaging bridge with built-in access control. Manage pairing, allowlists, and policy via /telegram:access. |
| `vanguard-advisor-tools` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Vanguard Advisor Tools for financial professionals: research and compare funds and ETFs across the industry and prepare for client conversations, using Vanguard's advi... |
| `vibe-prospecting` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Vibe Prospecting connects Claude to live B2B company and contact data so users can search, match, enrich, filter, and export prospects at scale. It turns natural-langu... |
| `windsor-ai` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect Claude Code to 325+ business data sources via Windsor.ai. Query marketing, sales, CRM, ecommerce, finance, and analytics data from Google Ads, Meta, HubSpot, S... |
| `youdotcom-agent-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | You.com agent skills for web search, research with citations, and content extraction. Guided integrations for Vercel AI SDK, Claude Agent SDK, OpenAI Agents SDK, crewA... |
| `zapier` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Connect 8,000+ apps to your AI workflow. Discover, enable, and execute Zapier actions directly from your client. |
| `zocks-advisor` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Seven skills for financial advisors built on Zocks meeting intelligence: client behavioral profiles, attrition-risk ranking, held-away asset radar, client journey doss... |
| `zoominfo` | external: url | skills bundle; likely usable offline | Search companies and contacts, enrich leads, find lookalikes, and get AI-ranked contact recommendations. Pre-built skills chain multiple ZoomInfo tools into complete B... |
| `activecampaign` | external: url | skills bundle; likely usable offline | Marketing automation, CRM, and email marketing powered by ActiveCampaign. Manage contacts, campaigns, automations, deals, and get AI-powered marketing insights — all f... |
| `hubspot-sales` | external: git-subdir | skills bundle; likely usable offline | Run your HubSpot sales workflow directly from Claude. Adds skills that cover the full sales day: import contacts and deals into HubSpot, get a prioritised morning brie... |
| `wingspan` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Ask Claude about the contractors you pay through Wingspan, what you owe them, and what is holding up a payment, then onboard contractors and log payments as drafts, wi... |
| `amazon-selling-partner` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Connect your Amazon Seller Central account to Claude. Ask about sales, inventory, and listing performance and get recommendations grounded in your own data, then revie... |

### security (18)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `42crunch-api-security-testing` | external: git-subdir | skills bundle; likely usable offline | Automate API security directly in Claude Code with 42Crunch - automatically audit OpenAPI specs, detect vulnerabilities aligned with OWASP API Security risks (includin... |
| `auth0` | external: git-subdir | skills bundle; likely usable offline | Enterprise-grade auth, easy to implement. Add login, SSO, MFA, and access control to any app with framework-aware guidance. |
| `claude-security` | Anthropic (in repo) | 1 skill, 9 agents, hooks (UserPromptExpansion, PostToolUse, PermissionRequest), workflow scripts. Needs Python >=3.9; heavy model usage; sends usage counts via CC telemetry (opt-out). | Deep vulnerability scanning of your own code, run entirely inside your Claude Code session at a chosen effort tier, with every finding challenged before it is reported... |
| `crowdsec` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Operational skill for installing, configuring, operating, and debugging CrowdSec (cscli, LAPI/CAPI, hub, bouncers, WAF/AppSec) across bare-metal, Docker, and Kubernetes. |
| `crowdstrike-falcon-foundry` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | CrowdStrike Falcon Foundry development skills for building cybersecurity applications on the Falcon platform. Includes UI development, collections, functions, workflow... |
| `crowdstrike-falcon-fusion` | external: url | skills bundle; likely usable offline | CrowdStrike Falcon Fusion skills for authoring, deploying, and executing Fusion workflows. Includes live action discovery, YAML authoring with schema validation, workf... |
| `duende-skills` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Duende development skills and agents for Claude Code — covering OAuth/OIDC protocols, IdentityServer, token management, ASP.NET Core authentication/authorization, BFF ... |
| `jfrog` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Use the JFrog Platform from Claude Code: Artifactory repos and artifacts, security findings and exposures, Catalog package safety and downloads, workflows across the S... |
| `security-guidance` | Anthropic (in repo) | Hooks only: SessionStart, UserPromptSubmit, PostToolUse (Edit\|Write\|MultiEdit\|NotebookEdit; Bash git commit/push), Stop, SubagentStop. Needs python3 >=3.10 and one-time pip+network to install Agent SDK into ~/.claude/security; extra model calls per turn/commit. | Security review for Claude-generated code. Pattern-based warnings on edits, LLM-powered diff review on Stop, and an agentic commit reviewer that catches injection, XSS... |
| `semgrep` | external: git-subdir | skills bundle; likely usable offline | Semgrep catches security vulnerabilities in real-time and guides Claude to write secure code from the start. |
| `sonarqube` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Automatically enforce SonarQube code quality and security in the agent coding loop — 7,000+ rules, secrets scanning, agentic analysis, and quality gates across 40+ lan... |
| `sonatype-guide` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Sonatype Guide MCP server for software supply chain intelligence and dependency security. Analyze dependencies for vulnerabilities, get secure version recommendations,... |
| `stackhawk-hawkscan` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Configure, run, and interpret HawkScan DAST results inside Claude Code. Generates stackhawk.yml configs, runs scans via CLI or Docker, and transforms security findings... |
| `stackhawk-api` | external: git-subdir | external service, account or CLI likely (hosted MCP/SaaS) | Query the StackHawk platform API for security posture reporting, findings analysis, and app management. Guides agents through authentication, data retrieval, and resul... |
| `vanta` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | The Vanta plugin connects Claude Code to Vanta's security and compliance platform through the Vanta MCP server. It combines Vanta's test-specific remediation intellige... |
| `vanta-mcp-plugin` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | The Vanta plugin connects Claude Code to Vanta's security and compliance platform through the Vanta MCP server. It combines Vanta's test-specific remediation intellige... |
| `workos` | external: git-subdir | skills bundle; likely usable offline | WorkOS integration skills for AuthKit, SSO, Directory Sync, RBAC, Vault, Audit Logs, migrations, and API references. |
| `zscaler` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Manage Zscaler cloud security platform including ZPA (private access), ZIA (internet access), ZDX (digital experience), ZCC (client connector), EASM (attack surface), ... |

### testing (2)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `growthbook` | external: url | skills bundle; likely usable offline | A suite of agent skills for the full GrowthBook feature flag and experimentation lifecycle. |
| `playwright` | partner (in repo) | stdio MCP `npx @playwright/mcp@latest`. Local; one-time npm download + `npx playwright install` browsers. | Browser automation and end-to-end testing MCP server by Microsoft. Enables Claude to interact with web pages, take screenshots, fill forms, click elements, and perform... |

### uncategorized (14)

| Plugin | Kind | Installs / needs | Description |
|---|---|---|---|
| `ai-plugins` | external: url | skills bundle; likely usable offline | Set up endorctl and use Endor Labs to scan, prioritize, and fix security risks across your software supply chain |
| `aikido` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Aikido Security scanning for Claude Code — SAST, secrets, and IaC vulnerability detection powered by the Aikido MCP server. |
| `atlan` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Atlan data catalog plugin for Claude Code. Search, explore, govern, and manage your data assets through natural language. Powered by the Atlan MCP server with semantic... |
| `brightdata-plugin` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Web scraping, Google search, structured data extraction, and MCP server integration powered by Bright Data. Includes 7 skills: scrape any webpage as markdown (with bot... |
| `cloudinary` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Use Cloudinary directly in Claude. Manage assets, apply transformations, optimize media, and more through natural conversation. |
| `data-engineering` | external: url | skills bundle; likely usable offline | Data engineering plugin - warehouse exploration, pipeline authoring, Airflow integration |
| `fastly-agent-toolkit` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Fastly development tools and platform skills |
| `fiftyone` | external: url | skills bundle; likely usable offline | Build high-quality datasets and computer vision models. Visualize datasets, analyze models, find duplicates, run inference, evaluate predictions, and develop custom pl... |
| `nightvision` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Skills for working with NightVision, a DAST and API Discovery platform that finds exploitable vulnerabilities in web applications and REST APIs |
| `nimble` | external: url | skills bundle; likely usable offline | Nimble web data toolkit — search, extract, map, crawl the web and work with structured data agents |
| `postiz` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Social media automation CLI for scheduling posts, managing integrations, uploading media, and tracking analytics across 28+ platforms including X, LinkedIn, Reddit, Yo... |
| `prisma` | external: url | external service, account or CLI likely (hosted MCP/SaaS) | Prisma MCP integration for Postgres database management, schema migrations, SQL queries, and connection string management. Provision Prisma Postgres databases, run mig... |
| `remember` | external: url | skills bundle; likely usable offline | Continuous memory for Claude Code. Extracts, summarizes, and compresses conversations into tiered daily logs. Claude remembers what you did yesterday. |
| `build-with-wordpress` | external: url | skills bundle; likely usable offline | Craft production-grade WordPress sites and applications. Everything from themes and plugins to commerce and deployment. |

## 2. Which plugins matter for Hotel-CRM (TypeScript/React/Electron-or-Tauri/SQLite, Turkish UI, strict rules)

### 2.1 Recommended: enable in `.claude/settings.json` (local sessions)

| Plugin | What it gives this project | Cost / caveats |
|---|---|---|
| `typescript-lsp` | Go-to-definition, references and diagnostics for `.ts/.tsx` so Claude sees type errors without running `tsc` each time. Pure LSP config (`typescript-language-server --stdio`). | Each developer runs `npm i -g typescript-language-server typescript` once. |
| `security-guidance` | Three-layer self-review of Claude-written code: free regex check on every Edit/Write (`eval`, `new Function`, `child_process.exec`, `dangerouslySetInnerHTML`, `.innerHTML =`, `document.write`...), background LLM diff review at `Stop`, agentic review on `git commit`/`git push`. Findings are fed back to Claude in-session. Extensible with `.claude/claude-security-guidance.md` (threat model in prose, e.g. Electron IPC rules, G-23 service-layer authorization) and `.claude/security-patterns.yaml` (custom regex, e.g. forbid `nodeIntegration: true`, `webSecurity: false`, `shell.openExternal(` with untrusted input). | Python >=3.10 on PATH; first run pip-installs the Agent SDK (network once). Extra model usage per turn/commit. Does **not** block; pair with hooks for hard rules. |
| `pr-review-toolkit` | Six reviewer agents invoked by name or proactively: `code-reviewer` (CLAUDE.md compliance, 0-100 confidence), `silent-failure-hunter` (empty catch blocks, swallowed errors; very relevant for backup/restore and IPC code), `type-design-analyzer` (invariants on domain types: Reservation, Stay, Payment), `pr-test-analyzer`, `comment-analyzer`, `code-simplifier`. No external services. | Six agent descriptions in context every turn; measure with `claude plugin details pr-review-toolkit`. The `code-simplifier` agent duplicates the standalone plugin; pick one. |
| `code-simplifier` | Single opus agent that simplifies recently modified code without changing behaviour; its prompt already encodes "no nested ternaries, explicit return types, explicit Props types". | Overlaps with pr-review-toolkit's copy. |
| `commit-commands` | `/commit` and `/commit-push-pr` with pre-approved `git add/commit/push`, `gh pr create`; `/clean_gone` prunes deleted branches. Tiny context cost. | Needs `gh` for PRs. If the project sets its own commit rules in CLAUDE.md, also set `includeGitInstructions: false`. |
| `frontend-design` | One skill with a strong anti-"generic AI UI" brief: deliberate palette/typography, no SaaS-card kit, no all-caps eyebrow labels, copy written from the user's perspective, accessibility floor (keyboard focus, reduced motion). Directly serves G-130 (shadcn/ui, light/dark, owner colours) and the tape-chart work. | Written for marketing pages as much as apps; combine with a project `ui` rule. Vendor it into `.claude/skills/` for cloud sessions. |
| `feature-dev` | `/feature-dev` seven-phase workflow (discovery, parallel `code-explorer` agents, clarifying questions, 2-3 `code-architect` proposals, implementation, `code-reviewer`). Good fit for each phase file in `docs/plan/fazlar/`. | Interactive; the proposed `phase-runner` skill can call it or replace it. |
| `claude-md-management` | `/revise-claude-md` captures session learnings into CLAUDE.md with approval; `claude-md-improver` audits CLAUDE.md quality. Keeps the memory file accurate over many sessions. | None. |
| `hookify` | Turns "stop doing X" into a rule file (`.claude/hookify.<rule>.local.md`: `event: bash/file/stop/prompt`, regex `pattern`, `action: warn/block`) with no hooks.json editing; `/hookify` with no args analyses the conversation for mistakes to prevent. Good for fast, per-developer prohibitions while the project's committed hooks are still being written. | python3 (stdlib). Rules are `.local.md` (per developer unless you commit them); the plugin must be enabled on the machine, so not available in cloud sessions. For committed, cross-surface rules write native hooks (section 5). |
| `playwright` | Microsoft's Playwright MCP (`npx @playwright/mcp@latest`): navigate, click, fill, screenshot. Lets a `ui-reviewer` agent look at the renderer (Vite dev server) and take screenshots; also supports writing e2e tests. | Local only after the first npm download; run `npx playwright install` once. For true Electron window automation use Playwright's `_electron` API from a script (section 5) rather than the MCP. |
| `context7` | Hosted docs MCP for version-accurate API docs (Electron, better-sqlite3, TanStack, shadcn, i18next...). Reduces hallucinated APIs. | Internet at dev time only (the product itself stays offline, G-01). Anonymous OK; `CONTEXT7_API_KEY` for higher limits. Disable when working offline. |

### 2.2 Optional / situational

| Plugin | When to use | Notes |
|---|---|---|
| `claude-security` | Before each release and at the end of security-sensitive phases (auth/roles G-20..G-25, backup G-120). `/claude-security scan changes` on the branch at `high` effort; writes `CLAUDE-SECURITY-<ts>/` report + SARIF + optional patches. | Python >=3.9; many tokens; findings are independently verified so reports are short. Not an everyday tool. |
| `code-review` | Only if work flows through GitHub PRs: `/code-review` launches 5 parallel reviewers + confidence scoring and comments on the PR via `gh`. | Needs GitHub + `gh`. For a solo repo the `pr-review-toolkit` agents on the working tree are cheaper. |
| `claude-code-setup` | Run once (`"recommend Claude Code automations for this repo"`) after the stack is scaffolded; read-only recommender for hooks/skills/MCP. | One-off. |
| `skill-creator` | When authoring the project skills in section 5: writes `evals/evals.json`, runs with/without the skill, grades, tunes descriptions. | python3. |
| `ralph-loop` | Long autonomous loops ("implement faz-04 until all checklist items pass, say DONE"). Its Stop hook re-feeds the prompt until a completion promise appears. Pairs naturally with `phase-runner`. | Dangerous without hard hooks in place; use `--max-iterations`. |
| `superpowers` (external, obra) | Opinionated workflow skills: brainstorming, TDD red/green, systematic debugging, subagent-driven development with built-in review. Popular, but large and prescriptive. | External git source: per-machine install. Evaluate context cost before adopting. |
| `mattpocock-skills` (external) | TypeScript-centric engineering skills (spec/ticket flow, TDD, domain modelling, code review). Closer to this stack than superpowers. | External; per-machine install. |
| `chrome-devtools-mcp` (external) | Performance traces / network / console for the renderer; useful when tuning the 10-year virtualised tape chart (G-31). | npx, local. |
| `modern-web-guidance` (Google Chrome, external) | Skills with current web platform best practices (CSS, a11y, performance). | Skills-only; offline. |
| `semgrep`, `sonarqube`, `coderabbit`, `aikido`, `greptile`, `qodo` | SAST / external code review as a second opinion. `sonarqube` adds PostToolUse analysis after every edit and pre-tool secret scanning. | All need a CLI and/or SaaS account; `coderabbit` is free. Only if the owner wants an external reviewer. |
| `serena` | Semantic navigation MCP via `uvx`. | Redundant once `typescript-lsp` is in place. |
| `github` MCP | Issues/PRs through the hosted GitHub MCP. | `gh` CLI (already used by `commit-commands` and `code-review`) covers this without a PAT in settings. |
| `remember` (external) | Daily session logs as memory. | Claude Code now has auto memory built in; skip unless needed. |

### 2.3 Not relevant (skip)

`agent-sdk-dev`, `mcp-server-dev`, `plugin-dev`, `mcp-tunnels` (SDK/plugin authoring), all other `*-lsp` plugins (C/C++, C#, Go, Java, Kotlin, Lua, PHP, Python, Ruby, Rust, Swift), `code-modernization` (legacy rewrites), `explanatory-output-style`/`learning-output-style` (token cost every session), `math-*`, `cwc-makers`, `receipts`, `session-report`, `project-artifact`, `playground`, the messaging bridges (`discord`, `telegram`, `imessage`, `fakechat`), every database connector (`supabase`, `neon`, `prisma`, `mongodb`, `firebase`, `bigquery`...; none speak to a local SQLite file), all deployment/monitoring/productivity SaaS connectors, and the design SaaS plugins (`figma`, `canva`, `superdesign`) unless the owner has those accounts. `desktop-commander` duplicates Claude Code's own file/terminal tools.

### 2.4 Suggested `enabledPlugins` for this repo

Everything below is an in-repo (relative-path) plugin, so committing the entry is enough for local sessions once the official marketplace is registered on the machine (it registers itself on the first interactive terminal session):

```json
{
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "pr-review-toolkit@claude-plugins-official": true,
    "commit-commands@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "feature-dev@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "hookify@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "context7@claude-plugins-official": true
  }
}
```

`code-simplifier` is left out because `pr-review-toolkit` already ships that agent. `claude-security`, `skill-creator`, `ralph-loop` are better installed at user scope by whoever needs them (`claude plugin install claude-security@claude-plugins-official`).

## 3. Installing marketplace plugins so every future session gets them

### 3.1 Scopes and files

| Scope | Settings file written | Who gets it |
|---|---|---|
| user | `~/.claude/settings.json` | you, every project on this machine |
| project | `.claude/settings.json` (committed) | everyone who clones the repo |
| local | `.claude/settings.local.json` (gitignored) | you, this repo only |

Precedence per plugin id, lowest to highest: `--add-dir` dirs, user, project, local, `--settings` flag, managed. A `false` in `.claude/settings.local.json` therefore opts one developer out of a project-enabled plugin. Keys are `<entry-name>@<marketplace-name>`.

### 3.2 Exact JSON for `.claude/settings.json`

```json
{
  "extraKnownMarketplaces": {
    "claude-plugins-official": {
      "source": { "source": "github", "repo": "anthropics/claude-plugins-official" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "pr-review-toolkit@claude-plugins-official": true,
    "commit-commands@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "feature-dev@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "hookify@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "context7@claude-plugins-official": true
  }
}
```

Notes from the docs:

- `extraKnownMarketplaces` is an object keyed by the marketplace's own `name`, each with a `source` object (`github` with `repo`; `git` with `url`; `url` with a hosted `marketplace.json`; `file`/`directory` with a path) and optional `autoUpdate`. (The settings-reference summary also mentions an array-of-URL shorthand; the object form is what the install/org/loading pages use, so prefer it.)
- For the official marketplace the `extraKnownMarketplaces` entry is optional: any `name@claude-plugins-official` entry in `enabledPlugins` declares it. Keep the explicit entry anyway so `claude -p` runs and fresh machines do not depend on an earlier interactive session.
- Repository `extraKnownMarketplaces` entries apply only after the developer accepts the workspace trust dialog for the folder (in `-p` runs: only in already-trusted folders).
- Relative-path plugins (all of the above) need no per-machine install record. For an external-source plugin add the entry **and** have each developer run once: `claude plugin install superpowers@claude-plugins-official --scope project` (otherwise `/plugin` shows `Plugin "<name>" is enabled in project settings but isn't installed here`).
- A third-party marketplace entry looks like `"hotel-tools": { "source": { "source": "github", "repo": "taliyigit2-prog/hotel-claude-plugins" } }` and its plugins are enabled as `"<name>@hotel-tools": true`.
- Shell commands: `claude plugin marketplace add anthropics/claude-plugins-official` (only needed on a machine that never ran an interactive session), `claude plugin install <name>@claude-plugins-official --scope project`, `claude plugin list`, `claude plugin details <name>` (always-on token cost), `claude plugin disable <name>@claude-plugins-official`, `/reload-plugins` inside a session.
- Cloud sessions ignore both keys. Server-managed settings (claude.ai admin console, Teams/Enterprise) are the only way to push plugins into cloud sessions.

### 3.3 Vendoring a plugin's skill into the repo (works everywhere, including cloud)

Copy `plugins/frontend-design/skills/frontend-design/{SKILL.md,LICENSE.txt}` to `.claude/skills/frontend-design/`. It then loads as a plain project skill in every surface. A whole plugin directory (with `.claude-plugin/plugin.json`) placed under `.claude/skills/<dir>/` loads as `<name>@skills-dir`, but project-scope skills-dir plugins load only from the primary working directory and after the trust dialog; loose skills/agents are simpler. If the vendored copy and the marketplace plugin are both enabled, both descriptions sit in context; keep one.

## 4. Exact file formats for project-local customisation

All of these are committed under `.claude/` (or the repo root for `CLAUDE.md`) and load in terminal, desktop, VS Code and cloud sessions.

### 4.1 Subagents: `.claude/agents/<name>.md`

Markdown with YAML frontmatter; `name` and `description` are required, everything else optional. Files with no `name`, a `name` containing `:` or starting with `-`, or invalid YAML are skipped (see `claude --debug`; validate with `claude plugin validate .claude/agents`).

| Field | Values |
|---|---|
| `name` | unique id, e.g. `turkish-ui-copy` |
| `description` | when Claude should delegate; keep it short (all agent descriptions share a 15k-token warning threshold), put detail in the body |
| `tools` | comma list or YAML list, e.g. `Read, Grep, Glob, Bash`; omit to inherit all; `Agent(worker, researcher)` restricts spawnable subagents |
| `disallowedTools` | e.g. `Write, Edit` or `mcp__github` |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, a full model id, or `inherit` |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns`, `effort` (`low`..`max`), `background: true`, `color`, `omitClaudeMd: true`, `isolation: worktree` | |
| `skills` | list of skill names preloaded into the agent's context |
| `mcpServers` | inline server definitions or names of configured servers |
| `hooks` | `PreToolUse`/`PostToolUse`/`Stop` hooks active only while the agent runs |
| `memory` | `user` (`~/.claude/agent-memory/<name>/`), `project` (`.claude/agent-memory/<name>/`, shareable), `local` |

Example, read-only reviewer with project memory:

```markdown
---
name: turkish-ui-copy
description: Reviews Turkish UI copy and i18n usage in renderer code and locale files. Use after adding or changing a screen, component, dialog, toast or locales/tr.json.
tools: Read, Grep, Glob
model: sonnet
memory: project
skills:
  - tr-copy-guide
---

You review user-facing Turkish text for a hotel desktop app used by reception staff.

Checks, in order:
1. Hardcoded strings: any JSX text, `placeholder`, `title`, `aria-label`, toast or dialog text not routed through `t('...')` (G-08). Report file:line and the suggested key.
2. Terminology: use the glossary in docs/plan/sozluk.md (rezervasyon, konaklama, kapora, satılmaz, park edilmiş...). Flag synonyms that drift.
3. Grammar and diacritics (ı/i, ş, ğ, ü, ö, ç), suffix agreement, sentence case for labels, no trailing full stops on buttons.
4. Tone: plain verbs, active voice, buttons name the outcome ("Kaydet", "Rezervasyonu iptal et"), errors say what happened and how to fix it.

Output a table: severity | file:line | current | proposed | reason. Do not edit files. Update your agent memory with recurring mistakes and accepted terminology.
```

Invocation: natural language ("use the turkish-ui-copy agent on src/renderer/pages/Reservations"), `@agent-turkish-ui-copy ...`, or automatically when the description matches.

### 4.2 Skills: `.claude/skills/<name>/SKILL.md`

All frontmatter fields are optional (`name` defaults to the directory name). Supporting files (`reference.md`, `scripts/`) sit beside `SKILL.md`; reference them with `${CLAUDE_SKILL_DIR}`. Legacy `.claude/commands/<name>.md` still works but a skill with the same name wins.

| Field | Meaning |
|---|---|
| `name`, `description` | `/name` in the menu; description drives auto-invocation (include the phrases users say, in Turkish and English) |
| `when_to_use` | extra trigger text appended to the description |
| `argument-hint` | e.g. `"[faz-no]"`; `arguments: [faz]` gives named `$faz` |
| `disable-model-invocation: true` | only the user can run it (side-effecting workflows: release, migrations) |
| `user-invocable: false` | hidden from `/` menu; only Claude loads it (reference knowledge) |
| `allowed-tools` | pre-approved for the skill's turn, e.g. `Bash(npm run *) Bash(git status *)`; `disallowed-tools` removes tools |
| `model`, `effort` | overrides while the skill is active |
| `context: fork`, `agent: Explore|Plan|general-purpose|<custom>`, `background: false` | run in an isolated subagent and (optionally) wait for the result |
| `paths` | glob list; the skill only activates when Claude works on matching files |
| `hooks` | hooks registered when the skill is invoked (persist for the session; `once: true` removes after first success) |
| `shell: bash|powershell`, `metadata`, `license`, `compatibility` | |

Substitutions: `$ARGUMENTS`, `$0`/`$1` (`$ARGUMENTS[N]`), `$name` for named args, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`. Dynamic context: a line starting with `` !`git diff HEAD` `` runs the command and inlines its output before Claude sees the skill (a failing command aborts the invocation). After compaction only the first 5,000 tokens of a skill are re-attached, so put the critical instructions first and phrase them as standing rules.

Example, manual phase executor:

```markdown
---
name: phase-runner
description: Executes one plan phase from docs/plan/fazlar as a verified checklist. Use for "run phase 3", "faz 3'ü uygula", "/phase-runner 03".
argument-hint: "[faz-no]"
arguments: [faz]
disable-model-invocation: true
allowed-tools: Bash(npm run *) Bash(npm test *) Bash(npx vitest *) Bash(git status *) Bash(git diff *) Bash(git log *)
---

## State

!`git status --short`
!`git log --oneline -5`

## Instructions (standing rules for the whole run)

1. Read `docs/plan/fazlar/faz-$faz.md` in full. Read every G-xx it cites in `docs/plan/01-gereksinimler.md`.
2. Build a task list from the phase checklist (one task per checkbox); do not add scope.
3. Before coding, state which files you will touch and which prohibitions in CLAUDE.md apply.
4. Implement item by item. After each item: `npm run typecheck`, `npm run lint`, the item's tests. An item is done only when all three pass.
5. UI items: call the `turkish-ui-copy` agent, then `ui-reviewer` for a screenshot review.
6. When all items pass, tick the checkboxes in `docs/plan/fazlar/faz-$faz.md`, append a "Sonuç" section (what was built, G-xx covered, open questions), run `/commit`.
7. Stop and ask the owner if a checklist item conflicts with a G-xx requirement; never silently reinterpret it.
```

### 4.3 Hooks in `.claude/settings.json`

Structure: `hooks` → event name → array of matcher groups → `hooks` array of handlers.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/db-migration-guard.mjs\"",
            "timeout": 10,
            "statusMessage": "Checking migration immutability"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git commit *)", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-commit-gate.mjs\"", "timeout": 600, "statusMessage": "typecheck + lint + tests before commit" },
          { "type": "command", "if": "Bash(npm install *)", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/deps-guard.mjs\"" },
          { "type": "command", "if": "Bash(pnpm add *)", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/deps-guard.mjs\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/no-network-guard.mjs\"" },
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/i18n-literal-warn.mjs\"" },
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/format-file.mjs\"", "timeout": 60 }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume|compact",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-context.mjs\"" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "prompt", "prompt": "If this turn edited files under src/, confirm the transcript shows `npm run typecheck` and the relevant tests passing after the last edit. If not, respond {\"ok\": false, \"reason\": \"run typecheck and tests\"}. If the user explicitly asked to skip checks, respond {\"ok\": true}." }
        ]
      }
    ]
  }
}
```

Facts to rely on (from the hooks reference and guide):

- **Events**: `SessionStart` (matchers `startup|resume|clear|compact|fork`), `Setup`, `UserPromptSubmit` (no matcher), `UserPromptExpansion` (matcher = command name), `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`/`SubagentStop` (matcher = agent type), `TaskCreated`/`TaskCompleted`, `Stop` (no matcher), `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged` (matcher = literal filenames `.env|.envrc`), `WorktreeCreate`/`WorktreeRemove`, `PreCompact`/`PostCompact`, `PreModelSwitch`/`PostModelSwitch`, `Elicitation`/`ElicitationResult`, `SessionEnd`.
- **Matcher syntax**: omitted/`""`/`"*"` = all; letters, digits, `_`, `-`, spaces, `,` and `|` = exact name or list (`Edit|Write`, `Edit, Write`); any other character makes it a JS regex (`^Notebook`, `mcp__playwright__.*`). Tool matchers are case-sensitive. MCP tools are `mcp__<server>__<tool>` (plugin servers: `mcp__plugin_<plugin>_<server>__<tool>`).
- **`if`** (tool events only): permission-rule syntax to filter on tool *and* arguments before spawning the process: `"Bash(git commit *)"`, `"Edit(*.ts)"`. Best-effort for compound shell commands; use `permissions.deny` for hard allow/deny of commands.
- **Input**: JSON on stdin with `session_id`, `cwd`, `hook_event_name`, `permission_mode`, plus per-event fields: `tool_name`, `tool_input` (`file_path`, `new_string`/`content` for edits, `command` for Bash), `tool_output`/`tool_use_id` (PostToolUse), `prompt` (UserPromptSubmit), `source` (SessionStart), `stop_hook_active` (Stop).
- **Exit codes**: `0` = no objection (stdout starting with `{` and ending with `}` is parsed as JSON; for `UserPromptSubmit`, `SessionStart`, `PostModelSwitch` plain stdout is added to Claude's context). `2` = block; stderr is the feedback (PreToolUse: tool call cancelled and stderr fed to Claude; PostToolUse: stderr fed to Claude, the action already happened; UserPromptSubmit: prompt rejected; Stop/SubagentStop: Claude must keep working; SessionStart: cannot block, stderr shown to user). Other non-zero = non-blocking error, action proceeds. Choose one of "exit 2 + stderr" or "exit 0 + JSON" per hook.
- **JSON output** (exit 0): top-level `continue` (false halts the session, `stopReason` shown), `systemMessage` (shown to user), `decision: "block"` + `reason` (PostToolUse, Stop, SubagentStop, UserPromptSubmit, PreCompact, TaskCompleted...), `hookSpecificOutput` with `hookEventName` and event fields: PreToolUse `permissionDecision: allow|deny|ask|defer`, `permissionDecisionReason`, `updatedInput` (rewrite tool args), `additionalContext`; PostToolUse `updatedToolOutput`, `additionalContext`; UserPromptSubmit/SessionStart `additionalContext` (nest it inside `hookSpecificOutput`, top-level is ignored); PermissionRequest `decision: {behavior: allow|deny, updatedInput, updatedPermissions}`. `additionalContext`/`systemMessage` capped at 10,000 chars. Multiple hooks run in parallel; the most restrictive decision wins (`deny` > `defer` > `ask` > `allow`) and all `additionalContext` is kept.
- **Handler fields**: `type` (`command`, `prompt`, `agent`, `http`, `mcp_tool`), `command` (+ `args` for exec form without a shell), `timeout` seconds (defaults 600 command/http/mcp_tool, 30 prompt, 60 agent; `UserPromptSubmit` default lowered to 30), `statusMessage`, `async: true` (fire and forget), `asyncRewake: true` (background, wakes Claude with stderr when it exits 2; `security-guidance` uses this), `once: true` (skill hooks), `shell: bash|powershell`, `if`. `${CLAUDE_PROJECT_DIR}` / `$CLAUDE_PROJECT_DIR` resolves the repo root; `${CLAUDE_PLUGIN_ROOT}` inside plugins.
- **Prompt hooks** answer `{"ok": true}` or `{"ok": false, "reason": "..."}` (`"impossible": true` lets a Stop end anyway; `continueOnBlock: true` on PreToolUse/PostToolUse returns the reason to Claude instead of ending the turn). **Agent hooks** (experimental) do the same with tools, 50 turns, 60 s default.
- **Stop hooks** fire on every assistant turn end, not only task completion, are overridden after 8 consecutive blocks, and should check `stop_hook_active` to avoid loops.
- `disableAllHooks: true` disables everything; `/hooks` shows the registered set (read-only); `claude --debug-file /tmp/claude.log` logs each hook's exit code and output. Scripts must be executable on macOS/Linux (`chmod +x`), and `file_path` may contain backslashes on Windows (normalise with `.replace(/\\/g, "/")`).

A minimal command hook in Node (`.claude/hooks/db-migration-guard.mjs`):

```js
#!/usr/bin/env node
// PreToolUse on Edit|Write|MultiEdit: committed migration files are immutable (new file instead).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const input = JSON.parse(readFileSync(0, "utf8"));
const fp = String(input.tool_input?.file_path ?? "").replace(/\\/g, "/");
const m = fp.match(/src\/db\/migrations\/([0-9]{4}_[^/]+\.sql)$/);
if (!m) process.exit(0);
let committed = false;
try {
  committed = execFileSync("git", ["ls-files", "--error-unmatch", "--", fp], { cwd: input.cwd, stdio: "pipe" }).toString().trim() !== "";
} catch { /* untracked = new migration, allowed */ }
if (committed) {
  process.stderr.write(`Blocked: ${m[1]} is already committed and may have been applied on a customer machine. Migrations are append-only: create the next numbered migration instead (CLAUDE.md > Veritabanı kuralları).\n`);
  process.exit(2);
}
process.exit(0);
```

Test it: `echo '{"cwd":".","tool_name":"Edit","tool_input":{"file_path":"src/db/migrations/0001_init.sql"}}' | node .claude/hooks/db-migration-guard.mjs; echo $?`.

### 4.4 `CLAUDE.md`, `CLAUDE.local.md` and `.claude/rules/`

- Locations in load order: managed policy file, `~/.claude/CLAUDE.md`, `./CLAUDE.md` or `./.claude/CLAUDE.md`, `./CLAUDE.local.md` (gitignore it). Parent directories load at launch; subdirectory `CLAUDE.md` files load on demand when Claude reads files there. Everything is concatenated, nothing overrides.
- **Length**: target under 200 lines per file; a warning appears at startup when files exceed the recommended length. Imports do not reduce cost (imported files load at launch too). Content Claude can derive from the code (directory listings, dependency lists) is wasted; keep pitfalls, rationale and conventions that differ from defaults. `/doctor prompt-audit` finds stale or conflicting instructions; `/init` generates a starting file (`CLAUDE_CODE_NEW_INIT=1` for the interactive multi-phase version).
- **Imports**: `@path/to/file` anywhere in the text; relative to the file containing the import; up to four hops; backslash-escape spaces; a path inside backticks is *not* imported (use that to mention a path). Imports resolving outside the working directory trigger an approval dialog.
- **Phrasing**: concrete and verifiable. "Use 2-space indentation", "Run `npm test` before committing", "API handlers live in `src/api/handlers/`" rather than "format properly". Group under headers and bullets; avoid contradictions between files (Claude may pick either). Anything that must happen at a fixed moment (before every commit, after every edit) belongs in a hook, not in prose.
- HTML comments (`<!-- -->`) are stripped before injection, so maintainers can annotate without spending tokens. `claudeMdExcludes` skips files by glob; `includeGitInstructions: false` removes the built-in commit/PR guidance when CLAUDE.md defines its own; `attribution.commit`/`attribution.pr` customise trailers.
- **Rules**: `.claude/rules/*.md` (recursive). Without frontmatter a rule loads at launch like CLAUDE.md. With `paths:` frontmatter (YAML list or comma string of globs, brace expansion allowed, e.g. `src/**/*.{ts,tsx}`) the rule loads only when Claude reads a matching file. `paths` is the only frontmatter field read. Project-root CLAUDE.md and unconditional rules are re-injected after `/compact`; path rules reload when a matching file is read again.
- Auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`, first 200 lines/25 KB) is written by Claude from corrections; "add this to CLAUDE.md" writes to the file instead.

Example `CLAUDE.md` skeleton (Turkish section titles are fine; Claude reads both):

```markdown
# Hotel-CRM — Claude çalışma kuralları

Masaüstü otel yönetimi uygulaması (Electron/Tauri + React + TypeScript + Tailwind + shadcn/ui + SQLite). Tamamen yerel çalışır; arayüz Türkçe.
Gereksinimler: @docs/plan/01-gereksinimler.md (G-xx kimlikleri). Mevcut faz: docs/plan/fazlar/DURUM.md.

## Komutlar
- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test -- --run` · `npm run e2e` · `npm run build` (installer)
- Commit öncesi: typecheck + lint + test geçmeli (pre-commit hook zorlar).

## Yasaklar (hook ile zorlanır; gerekçe burada)
- Ağ çağrısı yalnızca `src/main/net/` içinde ve isteğe bağlı özellikler için (G-01, G-02). Başka yerde `fetch`, `axios`, `WebSocket` yok.
- Telemetri, otomatik güncelleme, lisans sunucusu, bulut hesabı yok (G-07). `electron-updater`, `@sentry/*`, `posthog` gibi paketler eklenmez; bağımlılıklar `save-exact` ile sabitlenir.
- Kullanıcıya görünen metin koda gömülmez; `t('...')` ve `src/locales/tr.json` (G-08).
- Commit edilmiş migration dosyası değiştirilmez; yeni numaralı migration eklenir (G-120).
- Yetki kontrolü servis katmanında; arayüzde gizlemek yeterli değildir (G-23).
- Otelin özel kuralları ayar olarak modellenir, koda gömülmez (G-09).

## Kod kuralları
- Sunucusuz mimari: renderer → IPC (zod ile doğrulanmış) → `src/main/services/*` → `src/db/*` (parametreli SQL, tek `db` erişim noktası).
- Para: tam sayı kuruş + para birimi kodu; tarih: ISO yerel tarih string'i, `Temporal`/`date-fns-tz` ile.
- Yeni ekran = route + sayfa bileşeni + `tr.json` anahtarları + vitest + (gerekiyorsa) e2e.
- Detaylı kurallar: `.claude/rules/db.md`, `ui.md`, `ipc.md`, `testing.md` (yol bazlı yüklenir).

## Çalışma şekli
- Faz dosyasını okumadan koda başlama; faz kapsamı dışına çıkma.
- Her faz sonunda `turkish-ui-copy` ve `pr-review-toolkit:code-reviewer` ajanlarını çalıştır.
```

Example path-scoped rule `.claude/rules/db.md`:

```markdown
---
paths:
  - "src/db/**"
  - "src/main/services/**/*.ts"
---
# Veritabanı kuralları
- SQLite erişimi yalnızca `src/db/client.ts` üzerinden; `better-sqlite3` prepared statement, asla string birleştirme.
- Migration'lar `src/db/migrations/NNNN_aciklama.sql`, geri alma notu dosyanın başında; `schema.sql` üretilen dosyadır, elle düzenlenmez.
- Her tablo: `id` (ulid), `created_at`, `updated_at`; silme yerine `deleted_at` (denetim kaydı G-24).
- Yedek: açılış/kapanışta `backup()` API'si; yedek dizini ayarlardan (G-120).
```

## 5. Proposed project agents, skills and hooks (suggestions with rationale)

Design principles: prohibitions become command hooks (deterministic, cross-surface, cannot be bypassed); judgement calls become read-only review agents; repeatable multi-step procedures become manually-invoked skills; standing conventions go to CLAUDE.md + path-scoped rules. Scripts are Node ESM under `.claude/hooks/` so they run on Windows (Git Bash) without `jq`.

### 5.1 Hooks (`.claude/settings.json` + `.claude/hooks/*.mjs`)

| Hook | Event / matcher | Behaviour | Rationale |
|---|---|---|---|
| `db-migration-guard` | `PreToolUse` on `Edit\|Write\|MultiEdit` | Exit 2 if the target is a git-tracked file under `src/db/migrations/`; untracked (new) migrations pass. Optionally also deny edits to `src/db/schema.sql` (generated). | Applied migrations on customer machines can never be rewritten (G-120, "finished product" G-07). Script in 4.3. |
| `pre-commit-gate` | `PreToolUse` on `Bash`, `if: "Bash(git commit *)"`, `timeout: 600` | Runs `npm run typecheck && npm run lint && npm test -- --run`; on failure prints the last 60 lines to stderr and exits 2 so the commit is cancelled and Claude sees why. | Deterministic quality gate before every Claude-made commit. Also add husky/lint-staged so human commits get the same gate. |
| `no-network-guard` | `PostToolUse` on `Edit\|Write\|MultiEdit` | Scans `tool_input.new_string`/`content` for `fetch(`, `axios`, `XMLHttpRequest`, `WebSocket`, `net.request`, `http://`, `https://`; exit 2 with reason unless the file is under `src/main/net/` or is a test/doc. | G-01/G-02: the only network code lives in one optional module (exchange rates TCMB/ECB G-111, weather G-113). |
| `deps-guard` | `PreToolUse` on `Bash`, `if: "Bash(npm install *)"` / `"Bash(pnpm add *)"` / `"Bash(yarn add *)"` | Denies packages matching a blocklist (`electron-updater`, `@sentry/*`, `posthog*`, `mixpanel`, `firebase`, `analytics`, `segment`) and requires `--save-exact` unless `.npmrc` has `save-exact=true`; emits `additionalContext` reminding to record the dependency in `docs/plan/bagimliliklar.md`. | G-07: no telemetry/auto-update, pinned dependencies. |
| `i18n-literal-warn` | `PostToolUse` on `Edit\|Write`, files `src/renderer/**/*.tsx` | Regex for JSX text nodes or `placeholder=/title=/aria-label=` string literals containing letters; exit 0 with `hookSpecificOutput.additionalContext` ("hardcoded UI text at line N, use t()"). Warn, not block (regex false positives). | G-08. Hard enforcement comes from ESLint (`eslint-plugin-i18next/no-literal-string`) inside `pre-commit-gate`. |
| `format-file` | `PostToolUse` on `Edit\|Write\|MultiEdit` | `npx prettier --write <file>` then `npx eslint --fix <file>` for `*.ts/tsx`. `async: true` is acceptable here. | Consistent style without spending model turns. |
| `protect-files` | `PreToolUse` on `Edit\|Write` | Exit 2 for `.env*`, `package-lock.json`/`pnpm-lock.yaml` (unless the Bash command is the package manager), `docs/plan/01-gereksinimler.md` (requirements change only on explicit owner request: route through a `/requirement-change` skill). | Keeps lockfiles and the requirement catalogue from drifting silently. |
| `session-context` | `SessionStart`, matcher `startup\|resume\|compact` | Prints: current phase from `docs/plan/fazlar/DURUM.md`, `git status --short` (first 20 lines), the six hard prohibitions in one line each, and "run /phase-runner NN to continue". | Re-injects the essentials after `/compact` and on resume; cheaper than lengthening CLAUDE.md. |
| `stop-gate` | `Stop`, `type: prompt` (or `agent` for real verification) | Blocks the stop with `ok:false` when src/ changed and no passing typecheck/test run is visible in the turn. Respect `stop_hook_active`; the 8-block cap applies. | Prevents "done" claims without verification. Cost: one small model call per turn; make it `agent` type only if the prompt version proves too lax. |
| `e2e-after-ui` (optional) | `PostToolUse` on `Bash`, `if: "Bash(npm run e2e*)"`, `asyncRewake: true` | Lets long Playwright runs continue in the background and wakes Claude with failures. | Mirrors the `security-guidance` pattern. |

Also in `.claude/settings.json`: `permissions.allow` for the safe read-only commands the hooks and skills use (`Bash(npm run typecheck)`, `Bash(npm run lint)`, `Bash(npm test *)`, `Bash(git status *)`, `Bash(git diff *)`, `Bash(git log *)`), `permissions.deny` for `Read(./.env)` and `Read(./**/*.sqlite)`, and `includeGitInstructions: false` if the commit rules in CLAUDE.md differ from the defaults.

### 5.2 Agents (`.claude/agents/*.md`)

| Agent | Tools / model | Job | Rationale |
|---|---|---|---|
| `turkish-ui-copy` | `Read, Grep, Glob`; sonnet; `memory: project`; `skills: [tr-copy-guide]` | Reviews every user-facing string: hardcoded text, glossary consistency, diacritics, grammar, sentence case, button verbs, error-message quality. Produces a table, never edits. | G-08 and overall UI quality; a reviewer with its own memory converges on consistent terminology across dozens of sessions. |
| `ui-reviewer` | `Bash, Read, Glob, Grep`; sonnet; optional inline `mcpServers: playwright` | Starts the renderer (`npm run dev:renderer` or the Electron app via a `scripts/ui-shot.mjs` using Playwright's `_electron.launch`), takes screenshots of named routes at 1280x800 and 1024x700, light and dark, reads the PNGs (the Read tool displays images) and reviews against the `frontend-design` brief and `.claude/rules/ui.md`: tape-chart frozen columns (G-30), colour legend (G-32/33), keyboard focus, contrast, truncation of long Turkish words. | Visual regressions are invisible to a text-only review; screenshots cost few tokens. |
| `db-reviewer` | `Read, Grep, Glob, Bash(sqlite3 *)`; sonnet | Reviews schema/migrations/queries: parameterisation, foreign keys and indexes for the tape-chart range queries, money as integer kuruş, soft delete + audit log (G-24), backup/restore paths (G-120), migration ordering. Can open a scratch copy of the DB with `sqlite3`. | SQLite-specific pitfalls (WAL, busy timeouts, date formats) recur in every phase. |
| `security-reviewer` | `Read, Grep, Glob`; sonnet; `skills: [electron-security]` | Electron/Tauri hardening checklist: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP, no `remote`, every IPC channel validated with zod and authorised in the service layer (G-21/G-23), PIN/password hashing (argon2/scrypt), idle lock (G-22), no secrets in renderer. | Complements `security-guidance` (which only runs in local sessions) and covers desktop-specific rules the generic plugin does not know. |
| `requirements-tracer` | `Read, Grep, Glob`; haiku or sonnet | Given a diff or a phase, lists which G-xx items are touched, which checklist boxes in `docs/plan/fazlar/faz-NN.md` are satisfied, and which ZORUNLU items remain. | Keeps the plan and the code honest over many sessions. |

Vendored copies of `pr-review-toolkit`'s `silent-failure-hunter` and `type-design-analyzer` (Apache-2.0) can sit next to these so cloud sessions get them too.

### 5.3 Skills (`.claude/skills/<name>/SKILL.md`)

| Skill | Invocation | What it does | Rationale |
|---|---|---|---|
| `phase-runner` | `/phase-runner 03` (manual only) | Reads `docs/plan/fazlar/faz-03.md` and the cited G-xx rows, builds a task list, implements item by item with typecheck/lint/tests after each, runs `turkish-ui-copy`, `ui-reviewer`, `requirements-tracer` at the end, ticks the checklist, writes a "Sonuç" section, then `/commit`. Full text in 4.2. | The main unit of work across sessions; makes every session start from the same ritual. (The task mentioned `docs/plan/phases/phase-XX.md`; the repo uses Turkish `docs/plan/fazlar/`, so name files `faz-NN.md` and keep a `DURUM.md` index.) |
| `release` | `/release 1.0.0` (manual, `disable-model-invocation: true`) | Pre-flight: clean tree, version bump in `package.json`, CHANGELOG entry, `npm ci`, typecheck, lint, unit + e2e, `claude-security scan changes` if installed, grep for network calls outside `src/main/net/`, then `electron-builder --win --mac` (or `tauri build`), smoke-launch the packaged app via Playwright `_electron`, list artifact sizes and SHA-256. Stops at the first failure. | G-03/G-04/G-07: shipping a finished installer is the deliverable; the checklist must not live in anyone's head. |
| `add-migration` | `/add-migration "oda_tipi tablosu"` | Creates the next `NNNN_slug.sql` with header template (purpose, G-xx, rollback note), a matching test fixture, updates `schema.sql` by running the migration against a temp DB, and reminds that committed migrations are immutable. | Encodes the migration convention so the guard hook rarely has to fire. |
| `ui-screen` | `/ui-screen Rezervasyonlar` | Scaffolds route + page component (shadcn primitives only) + `tr.json` keys + vitest + empty/loading/error states + a Playwright e2e stub, following `.claude/rules/ui.md`. | Every screen starts conventional; copy goes to the locale file from the first line. |
| `qa` | `/qa` or auto ("run the checks") with `context: fork`, `agent: general-purpose`, `background: false` | Runs typecheck, lint, unit, e2e in an isolated subagent and returns a compact pass/fail summary with the failing test names. | Keeps 2,000 lines of test output out of the main context. |
| `requirement-change` | `/requirement-change G-37 "..."` (manual) | The only sanctioned way to edit `docs/plan/01-gereksinimler.md`: records the change, bumps the phase file, notes affected tests. Pairs with the `protect-files` hook. | Requirements are the contract with the owner. |
| `tr-copy-guide` | `user-invocable: false` | Reference: glossary (rezervasyon/konaklama/kapora/park edilmiş/satılmaz/no-show...), tone rules, date/number/currency formats (`1.250,00 ₺`, `15 Mart 2026`), pluralisation and suffix rules, do/don't examples. Preloaded into `turkish-ui-copy`. | Loaded only when needed, so it does not bloat CLAUDE.md. |
| `electron-security` | `user-invocable: false` | Reference checklist and code snippets for BrowserWindow options, preload bridge, IPC schema validation, CSP, packaging flags. Preloaded into `security-reviewer`. | Same reasoning. |
| `tape-chart` (later) | `user-invocable: false`, `paths: ["src/renderer/features/takvim/**"]` | Design notes for the virtualised 10-year grid (G-30/G-31): row/column virtualisation, frozen columns, colour mapping, day-use and double-booking rendering. | Path-scoped so it loads only when that feature is touched. |

### 5.4 Rules (`.claude/rules/`)

`db.md` (paths `src/db/**`, services), `ui.md` (paths `src/renderer/**/*.{ts,tsx}`: shadcn only, no inline styles, `t()` for text, light/dark tokens, keyboard navigation, Turkish sort/collation with `Intl.Collator('tr')`), `ipc.md` (paths `src/main/**`, `src/preload/**`: channel naming, zod schemas, authorisation in services), `testing.md` (vitest naming, test DB fixtures, e2e tags). Each under 60 lines.

### 5.5 Rollout order

1. Commit `CLAUDE.md`, `.claude/rules/*`, `.claude/settings.json` with the hooks and `enabledPlugins`, and the hook scripts; test each hook with piped sample JSON.
2. Add `phase-runner`, `qa`, `add-migration`, `ui-screen`, `release` skills and the five agents; vendor `frontend-design`.
3. Locally: `/plugin` to confirm the ten plugins loaded; `npm i -g typescript-language-server typescript`; `npx playwright install`; python3 >=3.10 for `security-guidance`.
4. After the first two phases run `/revise-claude-md` and `/hookify` (no args) to harvest corrections into CLAUDE.md and new rules; graduate stable hookify rules into native hooks.
5. Use `skill-creator` evals on `phase-runner` and `turkish-ui-copy` once they have been used a few times.

## Appendix A. Component inventory of the 54 in-repo plugins (from the clone)

| Plugin | commands | skills | agents | hooks.json | .mcp.json |
|---|---|---|---|---|---|
| agent-sdk-dev | 1 | 0 | 2 | no | no |
| clangd-lsp / csharp-lsp / gopls-lsp / jdtls-lsp / kotlin-lsp / lua-lsp / php-lsp / pyright-lsp / ruby-lsp / rust-analyzer-lsp / swift-lsp / typescript-lsp | 0 | 0 | 0 | no | no (lspServers declared in marketplace.json) |
| claude-code-setup | 0 | 1 | 0 | no | no |
| claude-md-management | 1 | 1 | 0 | no | no |
| claude-security | 0 | 1 | 9 | yes | no |
| code-modernization | 13 | 0 | 8 | yes | no |
| code-review | 1 | 0 | 0 | no | no |
| code-simplifier | 0 | 0 | 1 | no | no |
| commit-commands | 3 | 0 | 0 | no | no |
| cwc-makers | 1 | 2 | 0 | no | no |
| example-plugin | 1 | 2 | 0 | no | yes (dummy) |
| explanatory-output-style / learning-output-style | 0 | 0 | 0 | yes (SessionStart) | no |
| feature-dev | 1 | 0 | 3 | no | no |
| frontend-design | 0 | 1 | 0 | no | no |
| hookify | 4 | 1 | 1 | yes (Pre/PostToolUse, Stop, UserPromptSubmit) | no |
| math-olympiad | 0 | 1 | 0 | no | no |
| math-proof | 0 | 2 | 3 | no | no |
| mcp-server-dev | 0 | 3 | 0 | no | no |
| mcp-tunnels | 1 | 0 | 0 | no | no |
| playground | 0 | 1 | 0 | no | no |
| plugin-dev | 1 | 7 | 3 | no | no |
| pr-review-toolkit | 1 | 0 | 6 | no | no |
| project-artifact | 0 | 1 | 0 | no | no |
| ralph-loop | 3 | 0 | 0 | yes (Stop) | no |
| receipts | 0 | 1 | 0 | no | no |
| security-guidance | 0 | 0 | 0 | yes (SessionStart, UserPromptSubmit, PostToolUse, Stop, SubagentStop) | no |
| session-report | 0 | 1 | 0 | no | no |
| skill-creator | 0 | 1 | 0 | no | no |
| asana | 1 | 0 | 0 | no | no (MCP via command) |
| context7 / github / playwright / serena / firebase / gitlab / laravel-boost / linear / terraform / fakechat | 0 | 0 | 0 | no | yes |
| discord / imessage / telegram | 0 | 2 | 0 | no | yes |

## Appendix B. Plugin directory layout and manifest (for a future `hotel-crm-kit` plugin)

```
hotel-crm-kit/
├── .claude-plugin/plugin.json   # {"name":"hotel-crm-kit","description":"...","version":"0.1.0","author":{"name":"..."}}
├── skills/<name>/SKILL.md       # becomes /hotel-crm-kit:<name>
├── agents/<name>.md             # @agent-hotel-crm-kit:<name>
├── hooks/hooks.json             # same schema as settings.json "hooks"; paths via ${CLAUDE_PLUGIN_ROOT}
├── .mcp.json                    # {"mcpServers":{"name":{"type":"http","url":...}}} or {"name":{"command":...}}
└── README.md
```

Load it for one session with `claude --plugin-dir ./hotel-crm-kit`, validate with `claude plugin validate ./hotel-crm-kit`, publish through a `marketplace.json` in a GitHub repo and add it with `/plugin marketplace add <owner>/<repo>`. Entry `name` must equal the manifest `name`; names are immutable once published (`renames` map for migrations). Only worth doing if the same kit will be reused in a second project; for a single repo the loose `.claude/` files are simpler and also work in cloud sessions.
