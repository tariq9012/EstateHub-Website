# EstateHub — Frontend (React)

This is the frontend half of EstateHub. For project overview, backend setup, database
setup, and everything else, see the root **`README.md`** one level up. This file covers
frontend-only setup and the current route list.

This project originally started as a static HTML export from a design tool and was fully
converted to **React (Vite) + React Router + Tailwind CSS**; that conversion is complete —
there is no leftover static-HTML/Stitch code path in this app.

## Setup

```bash
npm install
npm run dev
```

Phir browser me `http://localhost:5173` khol lein.

Production build ke liye:

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
  App.jsx          -> saare 28 pages ke React Router routes
  main.jsx         -> app entry point
  index.css        -> Tailwind directives
  pages/           -> har page ek alag .jsx component
tailwind.config.js -> EstateHub design tokens (colors, fonts, radius, spacing)
```

## Routes

| Path | Page |
|---|---|
| `/` | Home |
| `/sign-in` | Sign In |
| `/browse-properties` | Browse Properties |
| `/property-details` | Property Details |
| `/list-your-property` | List Your Property |
| `/find-an-agent` | Find an Agent |
| `/agent-profile` | Agent Profile |
| `/user-dashboard` | User Dashboard |
| `/admin-dashboard` | Admin Dashboard |
| `/admin-review-queue` | Admin Review Queue |
| `/manage-properties` | Manage Properties |
| `/manage-users` | Manage Users |
| `/notification-settings` | Notification Settings |
| `/agent-verification-queue` | Agent Verification Queue |
| `/agent-verification-review` | Agent Verification Review |
| `/agent-verification-review-detail` | Agent Verification Review Detail |
| `/agent-certification-tracking` | Agent Certification Tracking |
| `/submit-license-renewal` | Submit License Renewal |
| `/license-renewal-document-upload` | License Renewal — Document Upload |
| `/license-renewal-review-submit` | License Renewal — Review & Submit |
| `/renewal-status-tracker` | Renewal Status Tracker |
| `/renewal-alert-preview` | Renewal Alert Preview |
| `/renewal-status-missing-documents-alert` | Missing Documents Alert |
| `/resolve-missing-documents` | Resolve Missing Documents |
| `/resubmission-success` | Resubmission Success |
| `/submission-success` | Submission Success |
| `/document-preview-modal` | Document Preview Modal |
| `/document-rejection-reasons-modal` | Document Rejection Reasons Modal |

## Notes

- Har page ka `<title>` `App.jsx` ke andar `PageTitle` wrapper se set hota hai (original HTML ke `<title>` se liya gaya).
- Design tokens (colors, typography scale, radius, spacing) DESIGN.md se `tailwind.config.js` me migrate kiye gaye hain.
- Icons Google's **Material Symbols Outlined** font se aa rahe hain (`index.html` me link diya gaya hai).
- Do jagah jahan static HTML me plain `onclick="..."` JS strings thi (mobile sidebar toggle aur password show/hide), unko proper React `useState` + `onClick` handlers me convert kiya gaya hai taake app real me interactive ho.
- Ye pages abhi standalone hain (shared Navbar/Footer alag component nahi banaya gaya, kyunke har page ka layout thoda different tha — Buyer site vs Admin portal vs Agent portal). Agar chahein to main aage inko shared `<Layout>` components me refactor kar sakta hoon taake code aur bhi DRY ho.
