# EduPro — Mini LMS (Interactive Learning Dashboard)

**What it is**  
EduPro is a client-side mini Learning Management System (LMS) built with HTML, Tailwind CSS and plain JavaScript. It supports user registration/login, per-user progress saved in `localStorage`, lesson viewer, final quiz, dashboard, and certificates.

**Live demo**  
https://waqasafridi.github.io/EduPro-LMS/

**Repository**  
https://github.com/WaqasAfridi/EduPro-LMS

## Features (requirements mapping)
- Homepage: Navbar, Hero, Trending Courses, Categories, Footer.
- Courses Listing: 6–12 courses loaded from `courses.json` (rendered on `/courses.html`).
- Course Detail Page: Banner, description, lesson list, progress bar, Start/Continue/Certificate CTA.
- Lesson Viewer: title, video placeholder, content, "Mark Completed" button, locked next-lesson behavior.
- Quiz: 5 MCQs per course, per-question feedback, score saved to `localStorage`, pass/fail indicator.
- Dashboard: enrolled courses, progress %, last visited lesson, quiz scores.
- Responsive layout using Tailwind CSS.
- Course data is seeded from `courses.json` into `localStorage` on first load.

## How it works (developer notes)
- `courses.json` contains the array of course objects (lessons & quizzes).
- On first run, a small loader mounts `courses.json` into `localStorage` (`lmsCourses`), then `window.coursesData` is set from localStorage for synchronous usage.
- User accounts and progress are stored in `localStorage` keys:
  - `lmsUsers` — array of user objects (name, email, password, progress)
  - `lmsCurrentUser` — currently logged-in user's email
  - `lmsCourses` — the course metadata (seeded from `courses.json`)

## How to run locally
**Prerequisite:** Use a local static server (fetch to `courses.json` requires HTTP):
```bash
# Option A: VS Code Live Server extension (recommended)
# Option B: npx http-server
npx http-server . -p 8080

# then open http://localhost:8080
