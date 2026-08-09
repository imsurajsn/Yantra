# Product Requirements Document
## Open-Source Internal Tool Platform with First-Class Governance
**Version:** Draft 0.3  
**Authors:** Suraj + [co-founder]  
**Date:** August 2026  
**Status:** Pre-build alignment

---

## 1. What We're Building

An open-source, self-hosted platform that lets companies build internal operational tools (dashboards, data tables, forms) while giving them enterprise-grade access governance — SSO, role-based access control, and audit logging — completely free, from day one, with no data leaving their infrastructure.

The core promise: **you own everything**. Deploy it on your own machine, connect it to your own database, and every action your team takes is logged in your own store. No SaaS vendor has visibility into your operations.

---

## 2. Who It's For and What Problem It Solves

**Primary user:** Engineering leads or technical co-founders at early-to-growth-stage startups (10–200 people), especially in data-sensitive industries (fintech, healthtech, e-commerce ops).

**The pain:** These teams need internal tools — a refund dashboard, an order management view, a customer lookup page. They either build these from scratch (expensive, slow) or use Retool/Appsmith (expensive at scale, data goes to a third party). When they try the open-source alternatives, they find that the governance features they actually need — proper SSO, audit logs, granular RBAC — are locked behind enterprise plans.

**The specific gap this fills:**
- Appsmith and ToolJet lock audit logs and SAML SSO behind paid tiers.
- Self-hosted versions of these tools require significant ops work to set up securely.
- None of them are designed with "one machine, one command, you own all data" as the primary deployment target.

**What we are not building for:** Large enterprises with dedicated infra teams, companies that want a no-code tool for non-technical users (our V1 configurers are developers or technical ops leads).

---

## 3. V1 Scope

### In Scope

### Deployment
- Single `docker compose up` install — one command, everything starts
- Ships with PostgreSQL bundled; configurable to point at any external Postgres, MySQL, or MariaDB instance via `.env`
- `.env`-driven configuration — no manual file editing beyond environment variables
- LLM-friendly installation documentation: step-by-step, copy-pasteable commands, explicit variable descriptions, zero assumed knowledge

### Authentication (V1 — Username/Password)
- **First-run setup wizard:** on initial launch with an empty database, the platform renders a setup screen (not a normal app page) prompting creation of the first Admin account. Requires: email (used as username), password, display name. No other access to the app until this is complete.
- Email address is the unique identifier / username for all users. No separate username field.
- Passwords hashed with bcrypt (cost factor 12).
- Session management via JWT (signed, server-verified). No sensitive data in localStorage.
- **User creation:** Admin creates user accounts directly — sets the user's email, display name, initial password, and role. Admin shares credentials with the user out-of-band (Slack, in person, etc.). No email/invite infrastructure needed.
- **Forced password change on first login:** a user logging in for the first time (flag on the account) is immediately redirected to a "set new password" screen before accessing any page. Ensures the admin-set initial password is replaced.
- **Password change:** any user (including Admin) can change their own password at any time from their profile screen, provided they know their current password.
- **Admin-managed password reset:** no self-service reset in V1 (requires no email sending). If a user forgets their password, Admin sets a new temporary password for them via the user management UI. User is forced to change it on next login.

> **V1.1 (next increment after V1 adoption):** Google OAuth SSO. Admin adds a user's email only — no password. User signs in with Google; if their Google account email matches, they're granted access at the configured role.

### Role-Based Access Control (RBAC)

The platform uses a **permission-based model**. Permissions are atomic strings grouped by domain. Roles are named bundles of those permissions. All access checks in code use `user.can("permission.string")` — never `user.role == "admin"`. This keeps V1 simple while making V2 extensibility a schema-level addition, not a rewrite.

#### Permission Groups

**Workspace Permissions** — govern platform-level actions:

| Permission | Description |
|---|---|
| `workspace.users.create` | Create new user accounts |
| `workspace.users.deactivate` | Deactivate / reactivate users |
| `workspace.users.reset_password` | Reset any user's password |
| `workspace.users.change_role` | Change a user's workspace role |
| `workspace.groups.create` | Create new groups |
| `workspace.groups.manage_all` | Manage any group (add/remove members, delete, rename) |
| `workspace.pages.create` | Create new pages |
| `workspace.pages.delete_any` | Delete any page in the workspace |
| `workspace.audit.view` | View the audit log |
| `workspace.settings.manage` | Manage workspace-level settings |

**Group Permissions** — scoped to a specific group, held by group admins:

| Permission | Description |
|---|---|
| `group.members.add` | Add members to the group |
| `group.members.remove` | Remove members from the group |
| `group.rename` | Rename the group |
| `group.delete` | Delete the group |

**Page Permissions** — scoped to a specific page, assigned via page ACL:

| Permission | Description |
|---|---|
| `page.view` | View and interact with the page |
| `page.edit_config` | Edit the page configuration |
| `page.delete` | Delete the page |
| `page.manage_acl` | Add / remove ACL entries on the page |

#### Built-in Roles (V1 — system-defined, not user-editable)

**Workspace roles** (one per user):

| Role | Permission Bundle |
|---|---|
| `Admin` | All workspace permissions |
| `Member` | `workspace.groups.create`, `workspace.pages.create` |
| `Viewer` | None — access governed entirely by page ACL |

**Group roles** (scoped per group, independent of workspace role):

| Role | Permission Bundle | How assigned |
|---|---|---|
| `Group Admin` | All group permissions | Auto-assigned to the Member who created the group |
| `Group Member` | None | Assigned by Group Admin or workspace Admin |

**Page ACL roles** (scoped per page, assigned via ACL entries):

| Role | Permission Bundle |
|---|---|
| `Owner` | `page.view`, `page.edit_config`, `page.delete`, `page.manage_acl` |
| `Editor` | `page.view`, `page.edit_config` |
| `Viewer` | `page.view` |

**Page ACL resolution:** a user's effective page role = highest role across all matching ACL entries (direct user entry + all group entries for groups they belong to). Workspace Admins bypass ACL entirely and always have full page access. Default deny if no entry resolves.

> **→ V2 — Custom Role Management:** Admin will be able to create custom workspace roles with arbitrary permission bundles drawn from the defined permission set. Built-in roles (`Admin`, `Member`, `Viewer`) remain permanent and uneditable. Custom roles can be created, edited, and deleted. The permission schema is designed to support this from V1 — no migration required when V2 ships. *(Full spec in V2 PRD.)*

### Audit Logging
- Every user action is logged: login, logout, page view, form submission, API call triggered
- Logs stored in user's own Postgres database — never transmitted externally
- Admin-only view: searchable log table (filter by user, date range, action type)
- Append-only: no UI action can delete or modify a log entry

### Page Primitives (Config-Driven, No Visual Builder)

V1 pages are defined via a JSON/YAML configuration file — not drag-and-drop. There are two page types:

1. **Data Table Page** — connects to a REST API endpoint (GET), renders results as a paginated, sortable table. Config specifies: endpoint URL, auth headers, column definitions, display labels.
2. **Form Page** — renders a form from a field config and POSTs the submission to a REST API endpoint. Supports text, number, dropdown (static options), and boolean field types.

These two types cover the majority of real ops use cases: "show me a list of things" and "let me do an action on something."

### User Management UI
- Admin-only screen: list of all users with email, display name, role, last login, status (active/inactive)
- Admin creates a user by entering: email, display name, initial password, role
- Admin can reset any user's password (sets a temporary one; user is forced to change on next login)
- No email sending required anywhere in V1

### Explicitly Out of Scope for V1

- Visual drag-and-drop page builder (V2)
- Maker-checker / four-eyes approval workflow (V2)
- Plugin system / extensible component registry (V2)
- Google OAuth / SSO (V1.1 — after V1 adoption)
- SAML / generic OIDC SSO (V2)
- LLM-based UI generation (V3 / premium)
- AWS / GCP / database direct connectors (all pages talk to REST APIs only in V1)
- Multi-workspace / multi-tenant support
- Managed cloud hosting (OSS self-hosted only in V1)
- Billing, payments, or any commercial infrastructure

---

## 4. Functional Requirements — V1

Requirements are numbered and testable. "User" = logged-in end user. "Admin" = user with Admin role.

### First-Run Setup
1. On first launch with an empty database, all routes redirect to `/setup`. No app pages are accessible until setup is complete.
2. Setup screen collects: Admin email, display name, password (minimum 8 characters). On submission, the Admin account is created and the user is redirected to the login screen.
3. Once any Admin account exists, the `/setup` route is permanently disabled and returns 404.

### Authentication
4. User signs in with their email and password via the login screen.
5. A user who does not exist, or whose password is wrong, receives a generic "invalid credentials" error. No indication of whether the email exists.
6. A user logging in for the first time (account has `must_change_password` flag) is immediately redirected to a password change screen. They cannot access any other page until the new password is set.
7. A logged-in user can change their own password from their profile screen (requires entering current password first).
8. There is no self-service password reset in V1. If a user forgets their password, they contact their Admin.
9. User session expires after 8 hours of inactivity; user is redirected to login.
10. User can sign out explicitly; JWT is invalidated server-side.

### RBAC — Workspace Roles
13. A user holds exactly one workspace role: `Admin`, `Member`, or `Viewer`.
14. Admin (`workspace.users.change_role`) can change any user's workspace role at any time; the change takes effect on their next page load.
15. Admin (`workspace.users.deactivate`) can deactivate any non-last-Admin user; deactivated users receive an "account disabled" message on login.

### RBAC — Groups
16. Any user with `workspace.groups.create` (Members and Admins) can create a group. The creator is automatically assigned the `Group Admin` role for that group.
17. Group Admins (`group.members.add`, `group.members.remove`) can add or remove members from their own groups.
18. Workspace Admins (`workspace.groups.manage_all`) can manage any group regardless of Group Admin assignment.
19. Group Admins (`group.delete`) can delete their own group; workspace Admins can delete any group. Deleting a group removes all its page ACL entries automatically.
20. A user can belong to zero or more groups simultaneously with no limit.

### RBAC — Page Access Control
21. Each page has an ACL: a list of entries, each specifying subject type (user or group), subject ID, and page role (Owner / Editor / Viewer).
22. A user with `page.manage_acl` on a page (Owners and workspace Admins) can add, edit, or remove ACL entries on that page.
23. A user's effective page role = highest role across: their direct ACL entry (if any) + ACL entries for all groups they belong to. If no entry resolves, access is denied (default deny).
24. Workspace Admins bypass page ACL entirely and always have full page access.
25. A user navigating to a page they cannot access sees a "Not Authorized" screen, not a blank page or error.
26. Navigation only surfaces pages where the user has a resolved effective role (plus all pages for workspace Admins).

> **→ V2:** Admin UI for creating and managing custom workspace roles with configurable permission bundles. *(Full spec in V2 PRD.)*

### Audit Log
26. Every login and logout event is recorded with: user email, timestamp, IP address, user agent.
27. Every page view is recorded with: user email, page ID, timestamp.
28. Every form submission is recorded with: user email, page ID, timestamp, field values submitted (excluding fields marked `sensitive: true` in page config, which are recorded as `[REDACTED]`).
29. Every API call triggered by a page action is recorded with: user email, endpoint called, HTTP method, timestamp, HTTP response status code.
30. Admin can view the audit log and filter by: user, date range, action type.
31. No user — including Admin — can delete or edit an audit log entry through any UI or API action. The audit log table has no DELETE or UPDATE endpoints exposed.

### Page Primitives
32. Admin can create a new Data Table Page via the admin UI by providing: page title, REST endpoint URL (GET), auth header key/value pairs (stored AES-256 encrypted), column definitions (field key, display label, sortable true/false), and ACL entries.
33. A user with an effective role on a Data Table Page can view it; data is fetched from the configured endpoint on page load.
34. Data Table Page supports client-side pagination (50 rows per page, configurable) and sorting by any column marked sortable.
35. Admin can create a new Form Page via the admin UI by providing: page title, REST endpoint URL (POST), auth headers, field definitions (field key, label, type: text/number/dropdown/boolean, required true/false, sensitive true/false), and ACL entries.
36. A user with an effective role of Editor or above can submit a Form Page; a user with an effective role of Viewer sees the form in read-only mode.
37. On successful form submission (2xx response), a configurable success message is displayed. On failure (non-2xx), the HTTP status and response body are shown.
38. Admin can edit or delete any page config. Deletion requires a confirmation step.

### User Management UI
39. Admin can see a list of all users: display name, email, workspace role, last login, account status (active / pending-first-login / disabled).
40. Admin can create a new user by providing: email, display name, initial password, workspace role. The account is created with `must_change_password = true`.
41. Admin can reset any user's password (sets a new temporary password; `must_change_password` is set to true). Admin cannot view existing passwords.
42. Admin can deactivate any user who is not the last remaining Admin. Attempting to deactivate the last Admin returns an explicit error.
43. Admin can view and manage groups: create a group, rename it, add/remove members, delete it.

---

## 5. Technical Approach

### Stack (Finalised)

| Layer | Choice | Reason |
|---|---|---|
| Backend language | Go | Small binary, easy Docker packaging, strong concurrency for audit log writes |
| Backend framework | Gin | Mature, performant, good middleware ecosystem |
| ORM / DB layer | GORM | Supports PostgreSQL, MySQL, MariaDB with driver swap; handles migrations via AutoMigrate |
| Frontend | React + TypeScript | Standard, good component ecosystem |
| Auth | Custom JWT + bcrypt | No external auth dependency; all auth data stays in user's DB |
| Packaging | Docker Compose | Single-command deploy, no Kubernetes required |
| Page config storage | Database (GORM model) | Admin can edit pages in-product without restarts; no YAML file mounting needed |
| Secret encryption | AES-256-GCM | API keys and auth headers for page configs encrypted at rest |
| License | AGPL-3.0 | Prevents cloud vendors from hosting without contributing back |

### Database Support

User sets `DB_TYPE` in `.env` to select their backend. GORM handles dialect differences.

| Value | Database |
|---|---|
| `postgres` | PostgreSQL (default; also bundled in Docker Compose) |
| `mysql` | MySQL 8.x |
| `mariadb` | MariaDB 10.6+ (uses MySQL driver; fully compatible) |

SQLite is explicitly excluded — not suitable for production audit logs or concurrent writes.

### Architecture Decisions

**Single-repo, single binary.** No microservices in V1. The Go binary serves both the REST API and the compiled React `dist/` folder (embedded via Go's `embed` package). Postgres/MySQL is the only external dependency. One Docker image, one process.

**Frontend served from Go binary.** React is compiled to static assets at build time. These are embedded into the Go binary using `//go:embed dist/*`. In production, no Node runtime is needed in the container. The resulting Docker image is small (~50MB).

```
docker-compose (prod):
  app     → Go binary: serves API (:8080) + static React assets
  db      → PostgreSQL (bundled; users can override with external DB)
```

**Page configs stored in DB, not files.** Admins create and edit pages through the admin UI. Configs are stored as GORM model rows. No container restart required for page changes. This is simpler for users than managing mounted YAML files.

**Audit log is an isolated DB table with no DELETE or UPDATE routes.** The audit log schema is write-once. The application layer has no UPDATE or DELETE methods on audit rows. Reviewed as part of any future security audit.

**Secrets encrypted at rest.** API auth headers stored in page configs are encrypted with AES-256-GCM before writing to DB. The encryption key is derived from `APP_SECRET` in `.env`. If `APP_SECRET` is not set, the application refuses to start.

**First-run detection.** On startup, the app checks whether any Admin user exists. If not, all routes return a redirect to `/setup`. The setup endpoint is disabled once an Admin exists.

### What We Rejected and Why

| Alternative | Rejected because |
|---|---|
| Node.js backend | Go chosen: smaller binary, simpler Docker image, better for a self-hosted tool |
| SQLite | Not suitable for concurrent audit log writes or production workloads |
| File-based page configs (YAML mount) | Requires container restart to change pages; worse admin UX than DB-backed |
| Google OAuth in V1 | Adds OAuth app registration complexity; email/password is simpler first step |
| SAML in V1 | Complex; deferred to V2 |
| Kubernetes / Helm | Too much ops complexity; target is one machine, one command |
| External auth service (Auth0, Firebase) | Defeats "no data leaves your infra" promise |

---

## 6. Constraints and Assumptions

- **Team:** Two people (founders), building alongside other commitments.
- **Timeline:** V1 target is 8–10 weeks from start.
- **Budget:** Near-zero; no paid infra during development. CI/CD via GitHub Actions (free tier).
- **Target deployment environment:** User's own server/VPS — DigitalOcean, AWS EC2, GCP Compute Engine, or a local machine. Not a managed Kubernetes environment.
- **Database:** PostgreSQL is bundled in Docker Compose for zero-config installs. Users can override with any external PostgreSQL, MySQL 8.x, or MariaDB 10.6+ instance via `.env`.
- **Users are technically literate:** V1 configurers (admins who set up pages) are developers or technical ops leads. They're comfortable editing YAML and running Docker commands.
- **English-only UI** in V1. Internationalisation is out of scope.

---

## 7. Known Risks and Open Questions

### Risks

**Competitor parity risk.** ToolJet already includes RBAC and audit logs in their open source version. The differentiation must come from execution quality (simpler deploy, better docs, cleaner audit UX) and the "one machine, truly yours" positioning — not just feature existence. Monitor ToolJet's open-source roadmap actively.

**Visual builder expectation.** Users who find the product expecting a Retool-style drag-and-drop experience will be disappointed by V1's config-driven pages. Documentation and README must clearly set this expectation upfront to avoid bad first impressions and GitHub issues about "missing features."

**AGPL licensing friction.** Some companies have legal policies against AGPL-licensed software. Worth adding a Commercial License option in V2 for those companies.

**Two-person bandwidth.** Scope creep is the primary risk. Every feature request must be evaluated against the V1 scope lock. No exceptions without explicitly updating this document.

### Open Questions

1. **What is the product name?** Needed before public GitHub repo is created. No decision yet.
2. **GitHub org name?** Needed to set up repo, CI, and GHCR image publishing.
3. **What is the first "real" user or org?** Before launch, identify one friendly company (friend, ex-colleague's startup) who will install V1 and give honest feedback. Do not launch cold into open source without this.
4. **Email sending deferred to V1.1:** V1 has no email dependency. Password resets are admin-managed. Self-service reset (and Google OAuth) land together in V1.1, at which point SMTP config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`) will be added to `.env`.
5. **V2 plugin interface spec:** The plugin contract (how a community-built component registers itself, what props it receives, how it emits events) needs to be designed before V2 starts. A bad plugin API is very hard to change once community plugins exist against it.

---

## 8. Success Criteria — V1

V1 is successful if, within 12 weeks of public GitHub release:

1. A person who has never seen the product can install it with `docker compose up` and be fully running in under 15 minutes, following only the README.
2. At least **3 real organisations** (not test accounts) are running it in a production or staging environment.
3. At least **1 org** has configured and is actively using the audit log for compliance or ops review.
4. GitHub repository has **50+ stars** (signal of genuine awareness, not just friends).
5. At least **5 GitHub issues** are feature requests (not bug reports) — this indicates people are using it and wanting more, which is the trigger to think about V2 prioritisation.
6. Zero critical security incidents: no auth bypass, no privilege escalation, no audit log tampering possible through any documented flow.

---

## 9. V2 Scope Preview

> **For the V2 PRD author:** This section is written to be self-contained. Each item below includes enough context to be extracted into a standalone V2 PRD without needing to re-read V1. V2 begins once V1 success criteria (Section 8) are met. The V1 DB schema and permission model are already designed to accommodate all items below without breaking migrations.

Once V1 success criteria are met, V2 adds:

**V2 — Custom Role Management**

*Context:* V1 ships with three fixed workspace roles (Admin, Member, Viewer) with hard-coded permission bundles. The V1 permission schema (`permissions` table, `role_permissions` join table) already supports custom roles — V2 exposes this through UI.

*What V2 adds:*
- Admin can create custom workspace roles, selecting any combination of the defined workspace permissions (see permission table in Section 3)
- Custom roles can be renamed or deleted; built-in roles (`Admin`, `Member`, `Viewer`) are permanent
- Custom roles can be assigned to users the same way built-in roles are
- All permission checks remain `user.can("permission.string")` — no code changes needed, only new role/permission rows

*Out of scope even in V2:* custom-defined new permissions (the permission strings themselves are system-defined); permission inheritance between roles.

---

**V1.1 — Google OAuth SSO**

*Context:* V1 uses email/password auth only. V1.1 adds Google OAuth as an alternative login method. Admin still manages which emails are allowed; Google just becomes the authentication mechanism instead of a password.

*What V1.1 adds:*
- Admin registers a Google OAuth app; provides `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
- Admin adds users by email only (no initial password needed)
- User clicks "Sign in with Google"; if their Google account email matches an active account, they're granted access
- Password-based and Google-based accounts can co-exist in the same workspace

---

**V2 — Visual Page Builder with Plugin Architecture**

*Context:* V1 pages are defined via YAML config files (config-driven, no visual editor). V2 replaces this with a drag-and-drop canvas while keeping the same underlying page model (Data Table, Form, row actions, CRUD support from V1).

*What V2 adds:*
- Drag-and-drop canvas with built-in components: data table, form, chart (line/bar/pie), text, button, badge
- Component properties panel: data source config, display options, event handlers
- Split-view editor: canvas on the right, component config on the left
- **Plugin system:** plugins are npm packages exporting a React component conforming to the platform plugin interface. A `plugins.json` in the deployment lists installed plugins. Community contributes via npm.
  - Plugin interface spec must be finalised before V2 build starts (see Open Questions)
  - Standard props: `data`, `config`, `onEvent`; standard lifecycle hooks
- **Premium tier:** curated plugin marketplace (Stripe, AWS S3, SendGrid, etc.) — vetted by core team, available under commercial license

*Pre-requisite:* Plugin interface contract must be designed and frozen before V2 development begins. A bad plugin API is very hard to change once community plugins exist against it.

---

**V2 — Maker-Checker Workflow**

*Context:* V1 Form Pages execute actions immediately on submit. Maker-checker adds a mandatory two-person approval step for sensitive operations — common in financial ops, customer data modification, and compliance-heavy workflows.

*What V2 adds:*
- New page-level ACL role: `Approver` (sits between Editor and Owner in authority)
- On pages configured for maker-checker: Editor submits a form → creates a pending change request (action not yet executed)
- Approver reviews the pending request and approves or rejects with a comment
- Action executes only on approval; rejection discards it
- Every approval/rejection is written to the audit log: approver email, decision, timestamp, comment

---

**V2 — SAML / Generic OIDC SSO**

*Context:* V1.1 adds Google OAuth only. V2 generalises to any standards-compliant identity provider.

*What V2 adds:*
- SAML 2.0 and OIDC support configurable via `.env` (no code changes)
- Enables Okta, Azure AD, Auth0, and any compliant IdP
- Can co-exist with Google OAuth and password auth

---

**V2 — Webhook / Audit Event Notifications**

*Context:* V1 audit log is view-only in the admin UI. V2 adds real-time notification triggers so teams can react to specific events without polling the log.

*What V2 adds:*
- Admin can configure webhook or Slack notification triggers
- Each trigger specifies: event type (form submission, page view, user login, etc.), optional filter conditions (e.g., field value threshold), and destination (webhook URL or Slack channel)
- Example: "POST to https://hooks.example.com/alert when a Refund form is submitted with amount > 500"
- Trigger failures are logged; no retry in V2 (V3 concern)

---

## Appendix: Competitive Positioning Summary

| | This Product | Appsmith | ToolJet | Retool |
|---|---|---|---|---|
| Self-hosted OSS | ✅ | ✅ | ✅ | ❌ (Enterprise only) |
| SSO free in OSS | ✅ (Google OAuth in V1.1) | ❌ (paid) | ❌ (paid) | ❌ |
| Audit logs free | ✅ | ❌ (paid) | ✅ | ❌ |
| One-command deploy | ✅ | Partial | Partial | ❌ |
| Visual builder | ❌ (V2) | ✅ | ✅ | ✅ |
| Data stays on your infra | ✅ | ✅ (self-hosted) | ✅ (self-hosted) | ❌ |
| Maker-checker | ❌ (V2) | ❌ | ❌ | ✅ (Enterprise) |

*Competitive data based on publicly available information as of mid-2026. Verify against current pricing pages before using in any external communication.*
