> ⚠️ **DRAFT — NOT BINDING.** The authoritative source of truth for this project is **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)**. This is an earlier vibe-coded draft to be challenged against requirements, not adopted (per doc 1 §2–§3). Retained for reference only.

# PRFAQ: CMDFW Bala Vihar App
### Chinmaya Mission DFW — Religious Education Program

**Document type:** Working Backwards / Project Charter  
**Date:** 2026-06-10  
**Status:** Inception — governs project scope and success criteria before Construction begins  
**Author:** CMDFW App Development Team (AS, MM, SS)

---

## Press Release

**FOR IMMEDIATE RELEASE**

### Chinmaya Mission DFW Launches Bala Vihar App — A Single Platform for Families, Teachers, and Organizers of Its Religious Education Program

*Dallas-Fort Worth, TX* — Chinmaya Mission DFW (CMDFW) today announced the launch of the Bala Vihar App, a mobile-first application that connects every participant in its Sunday religious education program — parents, high school students, teachers, coordinators, and leadership — on a single, purpose-built platform.

Bala Vihar is CMDFW's weekly religious education program, serving families across multiple centers in the DFW area. Until now, program coordination depended on WhatsApp groups, Emails, and Google Sheets — tools that were not designed for the structured, recurring workflow of running a Sunday school. Parents could miss class updates as they got buried in group chats. Teachers tracked attendance in spreadsheets. Teachers, required to report absences through a spreadsheet tracker, only used them sporadically, relying instead on informal channels to communicate with Coordinators.

The Bala Vihar App replaces this fragmentation with a single, role-aware platform. A parent opens the app to see their child's attendance record and the latest update from their teacher. A teacher submits attendance and posts a class update from their phone right after class, not hours (or days) later at a desktop. A coordinator sees a live compliance dashboard showing which teachers have and haven't submitted attendance and updates for the week — without having to check spreadsheets or Whatsapp groups.

The app is installable on any iOS, Android, or desktop device directly from a link — no app store visit required. Users receive a one-tap magic link by email to log in; no password to create or forget. For families with children in the program, the app supports multiple children under a single account.

The Bala Vihar App is available now to all registered CMDFW Bala Vihar participants. Access is by invitation from a center coordinator.

---

## Frequently Asked Questions

### Internal FAQs
*Questions the CMDFW leadership team and program stakeholders will ask.*

---

**Q: Why build a custom app? Why not use an existing school or church management platform?**

A: Existing platforms (e.g. Remind, Brightwheel, ChurchTrac) are built for either K-12 schools or generic church administration. None of them model the specific structure of a multi-center religious education program with the persona complexity we have — a parent who is also a teacher, a teacher who is also a coordinator, a coordinator who manages one session, while a central admin oversees all of them. The custom app also allows us to enforce COPPA compliance controls (no self-registration for minors, admin-provisioned accounts only) that generic platforms either do not offer or charge significantly for. The total cost of building and operating this app is less than the annual licensing cost of most comparable SaaS platforms at our scale.

---

**Q: How long will this take and what does it cost?**

A: Phase 1 (all seven core personas and the full feature set required for launch) is estimated at approximately 18 development slices over roughly 8 weeks. Infrastructure cost at launch is approximately $50/month (two Supabase Pro projects for staging and production). There are no per-user licensing fees. The app scales to the full CMDFW Bala Vihar enrollment without a cost increase. Phase 2 (native app store builds, push notifications, self-registration) adds approximately 5 slices and can be pursued after a stable Phase 1 launch.

---

**Q: What happens if the developer is unavailable? Are we locked into a single person?**

A: The project is built on widely-known, open-source technology: React Native (TypeScript), PostgreSQL (via Supabase), and standard web deployment. The full codebase, schema, and documentation are in version-controlled repositories. Any React Native or web developer can continue the work. The documentation set (9 documents covering architecture, data model, test plan, operations runbook, and all decision rationale) is specifically designed to allow a new developer to onboard without the original developer's involvement.

---

**Q: What are the COPPA and privacy risks of building an app that involves minors?**

A: COPPA (Children's Online Privacy Protection Act) applies because the program serves children under 13. The primary COPPA control is that **no child can create their own account** — all student accounts are only for high-schoolers (grades 9 - 12) and are provisioned by a coordinator. No child's personal information is collected directly from the child. The app collects only the minimum data required to run the program: name, email (for parents and teachers), and class enrollment. The full compliance posture is documented in `01_SECURITY_AND_COMPLIANCE.md`. Critically, all access control is enforced at the database layer via Row Level Security — a parent cannot access another family's records even if the app code had a bug.

---

**Q: What if Supabase goes out of business or raises prices significantly?**

A: Supabase is built on standard PostgreSQL. The database can be exported and hosted on any PostgreSQL-compatible service (AWS RDS, Neon, Railway, self-hosted). The application code uses the Supabase JavaScript SDK, but the underlying database queries are standard SQL. Migration to a different PostgreSQL host would require updating the connection configuration and replacing the Supabase Auth integration. This risk is documented in ADR-003. The open-source, non-proprietary nature of the stack is a deliberate choice.

---

**Q: How is this different from the prototype that was already built?**

A: The prototype validated the concept and the persona model. It was not production-ready: it had no Row Level Security enforcement (users could theoretically access any data), no error monitoring, an incomplete schema (missing the `academic_years` table and several audit columns), inconsistent TypeScript (widespread `any` usage), and no test coverage. The rebuild starts from the documented architecture, enforces strict TypeScript from line one, implements RLS as the primary access control mechanism, and gates every feature on a 44-item Definition of Done checklist. The prototype is a proof of concept; this is the production system.

---

**Q: How will we know if the launch was successful?**

A: Success at 60 days post-launch is defined as:

1. **Attendance compliance rate ≥ 90%** — at least 90% of teachers submit attendance within their class session, as measured by the coordinator compliance dashboard
2. **Parent adoption ≥ 75%** — at least 75% of enrolled families have logged in at least once
3. **Zero P1/P2 security incidents** — no unauthorized access to student or family data
4. **Coordinator time on administrative follow-up reduced** — coordinators self-report spending less than 30 minutes per week on administrative follow-ups, compared to the current baseline
5. **Teacher absence reporting via app ≥ 90%** — teachers report absences through the app rather than informally
6. **Customer Satisfaction ≥ 75%** - as measured by response to user surveys

These metrics are measured by the BV Coordinator using the in-app dashboards and a brief survey at the 60-day mark.

---

**Q: What is explicitly out of scope for the initial launch?**

A: The following are explicitly deferred to Phase 2 or later:
- Native iOS and Android app store distribution (Phase 1 is PWA only)
- Substitute teacher workflow (Phase 2)
- Volunteer signup and event management for volunteers (Phase 2)
- Phone OTP as an alternative login method (Phase 2)
- Push notifications (Phase 2)
- Self-registration for new users (Phase 2)
- The CMDFW public website (descoped entirely from this project)

---

### External FAQs
*Questions that participants — parents, teachers, coordinators, and students — will ask.*

---

**Q: Do I need to download anything from the App Store or Google Play?**

A: No. The app is a Progressive Web App (PWA). Your coordinator will send you a link. Open the link in your phone's browser, and you will see an option to "Add to Home Screen." This installs the app as an icon on your phone — it looks and behaves like any other app, but no App Store visit is required.

---

**Q: How do I log in? I don't remember setting a password.**

A: There is no password. Enter your email address on the login screen and tap "Send Magic Link." You will receive an email with a one-tap login button. Tap it, and you are logged in. The link works once and expires after one hour. If it expires before you tap it, simply request a new one.

---

**Q: I am both a parent and a teacher. Do I need two accounts?**

A: No. You have one account with one email address. After logging in, the app will ask you which role you want to use — Parent or Teacher. You can switch between them at any time from the profile menu.

---

**Q: My spouse and I both want access to our children's records. Can we both have accounts?**

A: Yes. Each parent creates their own account with their own email address. Both accounts are linked to the same children's records. Each parent sees the same class updates, attendance history, and announcements for their children.

---

**Q: I am a teacher. What does the app replace that I was doing before?**

A: Three things: (1) You no longer take attendance in the Google Sheet trackers — you submit it directly in the app during class. (2) If you are going to be absent, you report it in the app instead of marking in the Google Sheet, sending a message, or calling the coordinator. (3) You can post a brief class update directly to parents after each session — what was covered, any homework, upcoming topics — without needing to manage a separate group chat.

---

**Q: Is my child's information secure?**

A: Yes. The app is designed specifically for a program that involves children. Student records are only visible to that student's own family, their teacher, and the center coordinator. No student can see another student's record. No parent can see another family's information. Access controls are enforced at the database level — not just in the app — so they cannot be bypassed. Student accounts are created by coordinators, not by the students themselves, which is required by federal law for children under 13.

---

**Q: What if I don't have a smartphone?**

A: The app works in any modern web browser on a computer. Open the link your coordinator sends you, log in with your email, and use the full app in your desktop browser.

---

**Q: Who do I contact if I have a problem with the app?**

A: Contact your session coordinator. They have access to administrative tools that can resolve most account issues (resetting your session, updating your information, re-sending your invitation). For issues that require technical support, the coordinator will escalate to the BV Coordinator.

---

## Project Approvals

| Role | Name | Approval | Date |
|---|---|---|---|
| Program Director | | ☐ Approved | |
| BV Coordinator | | ☐ Approved | |
| Lead Coordinator | | ☐ Approved | |
| Technical Lead | | ☐ Approved | |

*This PRFAQ must be approved by all four roles before Construction (development) begins. Any changes to product scope, success metrics, or out-of-scope decisions after approval require a new version of this document.*

---

*Related documents:*
- *[01_SECURITY_AND_COMPLIANCE.md](01_SECURITY_AND_COMPLIANCE.md) — compliance requirements driving design decisions*
- *[03_PRD.md](03_PRD.md) — full feature specifications*
- *[04_ARCHITECTURE.md](04_ARCHITECTURE.md) — technical architecture*
- *[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) — rationale for key technical choices*
