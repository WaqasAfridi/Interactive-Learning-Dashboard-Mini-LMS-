const STORAGE_KEY_USERS = "lmsUsers";
const STORAGE_KEY_SESSION = "lmsCurrentUser"; // Stores the email of logged in user
const STORAGE_KEY_COURSES = "lmsCourses"; // optional cached JSON string
const PASS_SCORE = 3; // number of correct answers required to pass

/* ---------------------------
   Helper & Normalization Utils
   --------------------------- */

function _toId(x) {
  // normalizes id to string key used in stored user.progress
  if (x === null || x === undefined) return null;
  return String(Number(x));
}

function _safeParse(jsonStr, fallback = []) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return fallback;
  }
}

function _ensureUserStructure(user) {
  // Add missing properties if older data doesn't match expected schema
  if (!user) return;
  if (
    !("progress" in user) ||
    typeof user.progress !== "object" ||
    user.progress === null
  ) {
    user.progress = {};
  }
}

/* ---------------------------
   Course Data Load Helpers
   --------------------------- */

function getCourses() {
  // Returns the in-memory courses array (window.coursesData)
  if (Array.isArray(window.coursesData)) return window.coursesData;
  // fallback: try to read from localStorage
  const raw = localStorage.getItem(STORAGE_KEY_COURSES);
  if (raw) {
    try {
      window.coursesData = JSON.parse(raw);
      return window.coursesData;
    } catch (e) {
      window.coursesData = [];
      return window.coursesData;
    }
  }
  window.coursesData = [];
  return window.coursesData;
}

function getCourseById(id) {
  const courses = getCourses();
  const n = Number(id);
  return courses.find((c) => Number(c.id) === n) || null;
}

function ensureCoursesLoadedSyncFallback() {
  // Some pages include a synchronous loader for courses.json already.
  // This function tries to ensure window.coursesData exists by reading localStorage.
  if (!Array.isArray(window.coursesData)) {
    const raw = localStorage.getItem(STORAGE_KEY_COURSES);
    if (raw) {
      try {
        window.coursesData = JSON.parse(raw);
      } catch (e) {
        console.error("Failed to parse courses from localStorage:", e);
        window.coursesData = [];
      }
    } else {
      window.coursesData = [];
    }
  }
}

// Optionally available: async loader if you want to fetch courses.json when missing
async function ensureCoursesLoadedAsync() {
  // Try localStorage first
  if (Array.isArray(window.coursesData) && window.coursesData.length > 0)
    return window.coursesData;
  const raw = localStorage.getItem(STORAGE_KEY_COURSES);
  if (raw) {
    try {
      window.coursesData = JSON.parse(raw);
      return window.coursesData;
    } catch (e) {
      console.warn("Invalid cached courses.json, will fetch a fresh copy.");
    }
  }

  // Try fetching courses.json asynchronously (useful for dev/live server)
  try {
    const resp = await fetch("courses.json", { cache: "no-store" });
    if (resp.ok) {
      const data = await resp.json();
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(data));
      window.coursesData = data;
      return data;
    } else {
      console.warn("Failed to fetch courses.json:", resp.status);
    }
  } catch (err) {
    console.warn("Fetching courses.json failed:", err);
  }

  // If all fails, ensure array exists
  window.coursesData = window.coursesData || [];
  return window.coursesData;
}

/* ---------------------------
   Auth Utilities
   --------------------------- */

function getUsers() {
  const raw = localStorage.getItem(STORAGE_KEY_USERS);
  const arr = _safeParse(raw, []);
  // Normalize (migrate) structure
  arr.forEach(_ensureUserStructure);
  return arr;
}

function saveUsers(users) {
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users || []));
    // emit userChanged in case UI wants to refresh lists (not the logged in user)
    document.dispatchEvent(
      new CustomEvent("usersChanged", {
        detail: { count: (users || []).length },
      })
    );
  } catch (e) {
    console.error("Failed to save users:", e);
  }
}

function getCurrentUser() {
  const email = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!email) return null;
  const users = getUsers();
  const found = users.find((u) => u.email === email) || null;
  if (found) _ensureUserStructure(found);
  return found;
}

function loginUser(email, password) {
  const users = getUsers();
  const idx = users.findIndex(
    (u) => u.email === email && u.password === password
  );
  if (idx !== -1) {
    localStorage.setItem(STORAGE_KEY_SESSION, users[idx].email);
    // emit userChanged
    document.dispatchEvent(
      new CustomEvent("userChanged", {
        detail: { email: users[idx].email, action: "login" },
      })
    );
    updateAuthUI(); // immediate nav update
    return true;
  }
  return false;
}

function registerUser(name, email, password) {
  const users = getUsers();
  if (users.find((u) => u.email === email)) {
    return false; // User exists
  }
  const newUser = {
    name: String(name || "").trim() || "Student",
    email: String(email).trim(),
    password: String(password),
    progress: {},
  };
  users.push(newUser);
  saveUsers(users);
  localStorage.setItem(STORAGE_KEY_SESSION, newUser.email); // Auto login
  document.dispatchEvent(
    new CustomEvent("userChanged", {
      detail: { email: newUser.email, action: "register" },
    })
  );
  updateAuthUI();
  return true;
}

function logoutUser() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
  document.dispatchEvent(
    new CustomEvent("userChanged", { detail: { action: "logout" } })
  );
  updateAuthUI();
  // small delay to let UI update properly
  setTimeout(() => {
    window.location.href = "index.html";
  }, 80);
}

function requireAuth() {
  if (!getCurrentUser()) {
    window.location.href = "login.html";
  }
}

/* ---------------------------
   Progress & Enrollment (User-scoped)
   --------------------------- */

function getProgressDataForUser() {
  const user = getCurrentUser();
  if (!user) return {};
  _ensureUserStructure(user);
  return user.progress || {};
}

function getProgress(courseId) {
  const user = getCurrentUser();
  if (!user)
    return {
      enrolled: false,
      completedLessons: [],
      quizScore: null,
      lastVisited: null,
    };
  _ensureUserStructure(user);
  const key = _toId(courseId);
  const stored = user.progress[key];
  if (!stored) {
    return {
      enrolled: false,
      completedLessons: [],
      quizScore: null,
      lastVisited: null,
    };
  }
  // normalize fields defensively
  if (!Array.isArray(stored.completedLessons)) stored.completedLessons = [];
  if (!("quizScore" in stored)) stored.quizScore = null;
  if (!("enrolled" in stored))
    stored.enrolled = !!(
      stored.completedLessons.length || stored.quizScore !== null
    );
  return stored;
}

function saveUserProgress(courseId, courseProgressData) {
  const user = getCurrentUser();
  if (!user) return false;
  const users = getUsers();
  const idx = users.findIndex((u) => u.email === user.email);
  if (idx === -1) return false;
  _ensureUserStructure(users[idx]);
  const key = _toId(courseId);
  // ensure shape
  const safe = {
    enrolled: !!courseProgressData.enrolled,
    completedLessons: Array.isArray(courseProgressData.completedLessons)
      ? courseProgressData.completedLessons.map(Number)
      : [],
    quizScore:
      courseProgressData.quizScore !== undefined
        ? courseProgressData.quizScore
        : null,
    lastVisited:
      courseProgressData.lastVisited !== undefined
        ? courseProgressData.lastVisited
        : users[idx].progress[key] && users[idx].progress[key].lastVisited
        ? users[idx].progress[key].lastVisited
        : null,
  };
  users[idx].progress[key] = safe;
  saveUsers(users);

  // keep in-memory currentUser in sync (important for immediate UI)
  const current = getCurrentUser();
  if (current && current.email === users[idx].email) {
    window._cachedCurrentUser = users[idx]; // small cache to avoid refetching from localStorage
  }

  // emit event for UI updates
  document.dispatchEvent(
    new CustomEvent("progressUpdated", {
      detail: { courseId: Number(courseId), progress: safe },
    })
  );
  return true;
}

function enrollInCourse(courseId) {
  const user = getCurrentUser();
  if (!user) return false;
  const key = _toId(courseId);
  const p = getProgress(courseId);
  p.enrolled = true;
  // ensure arrays exist
  if (!Array.isArray(p.completedLessons)) p.completedLessons = [];
  if (!("quizScore" in p)) p.quizScore = null;
  return saveUserProgress(courseId, p);
}

function completeLesson(courseId, lessonId) {
  const user = getCurrentUser();
  if (!user) return false;

  const cid = _toId(courseId);
  const lid = Number(lessonId);
  const course = getCourseById(cid);
  if (!course) {
    console.warn("completeLesson: course not found:", courseId);
    return false;
  }

  // enforce lock: only allow completing lesson if previous lessons are done (basic lock)
  const progress = getProgress(cid);
  if (!Array.isArray(progress.completedLessons)) progress.completedLessons = [];

  // find lesson index in course
  const lessonIndex = (course.lessons || []).findIndex(
    (l) => Number(l.id) === lid
  );
  if (lessonIndex === -1) {
    console.warn("completeLesson: lesson not found:", lessonId);
    return false;
  }

  // If user tries to mark a lesson ahead of their progress, prevent it
  const maxAllowedIndex = progress.completedLessons.length;
  if (lessonIndex > maxAllowedIndex) {
    // lock: cannot complete this lesson yet
    return false;
  }

  if (!progress.completedLessons.includes(lid)) {
    progress.completedLessons.push(lid);
    progress.completedLessons = Array.from(new Set(progress.completedLessons))
      .map(Number)
      .sort((a, b) => a - b);
    // ensure enrolled flag
    progress.enrolled = true;
    // persist
    saveUserProgress(cid, progress);
    // update last visited to this lesson
    saveLastVisited(cid, lid);
    return true;
  }
  return false;
}

function saveQuizScore(courseId, score) {
  const user = getCurrentUser();
  if (!user) return false;
  const key = _toId(courseId);
  const p = getProgress(key);
  p.quizScore = Number(score);
  // optionally set enrolled true
  p.enrolled =
    !!p.enrolled || (p.completedLessons && p.completedLessons.length > 0);
  saveUserProgress(key, p);
  return true;
}

function saveLastVisited(courseId, lessonId) {
  const user = getCurrentUser();
  if (!user) return false;
  const key = _toId(courseId);
  const p = getProgress(key);
  p.lastVisited =
    lessonId !== undefined && lessonId !== null
      ? Number(lessonId)
      : p.lastVisited;
  // ensure enrolled flag if not present
  p.enrolled =
    !!p.enrolled || (p.completedLessons && p.completedLessons.length > 0);
  saveUserProgress(key, p);
  return true;
}

function getLastVisited(courseId) {
  const p = getProgress(courseId);
  return p && p.lastVisited ? p.lastVisited : null;
}

function getEnrolledCourseIdsForUser() {
  const prog = getProgressDataForUser() || {};
  return Object.keys(prog).filter((k) => {
    const e = prog[k];
    return !!(
      e &&
      (e.enrolled ||
        (Array.isArray(e.completedLessons) && e.completedLessons.length > 0) ||
        (e.quizScore !== null && e.quizScore !== undefined))
    );
  });
}

function calculateCourseProgress(courseId) {
  const course = getCourseById(courseId);
  if (!course) return 0;
  const p = getProgress(courseId);
  const totalLessons = Array.isArray(course.lessons)
    ? course.lessons.length
    : 0;
  const hasQuiz = Array.isArray(course.quiz) && course.quiz.length > 0;
  const totalUnits = totalLessons + (hasQuiz ? 1 : 0);
  if (totalUnits === 0) return 0;
  const completedLessonsCount = Array.isArray(p.completedLessons)
    ? p.completedLessons.length
    : 0;
  let completedUnits = completedLessonsCount;
  if (hasQuiz && p.quizScore !== null && p.quizScore !== undefined)
    completedUnits += 1;
  return Math.min(100, Math.floor((completedUnits / totalUnits) * 100));
}

/* ---------------------------
   UI Helpers (Navbar / Auth render)
   --------------------------- */

function updateAuthUI() {
  // Safe DOM queries
  const user = getCurrentUser();
  const navContainer = document.querySelector("nav .hidden.md\\:flex"); // Desktop nav area in your pages
  const mobileMenu = document.getElementById("mobile-menu");

  // Remove previous appended auth widgets to avoid duplicates
  const prev = document.getElementById("auth-widget-wrapper");
  if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

  if (user) {
    // Build wrapper
    const wrapper = document.createElement("div");
    wrapper.id = "auth-widget-wrapper";
    wrapper.className = "flex items-center ml-4";

    const nameSpan = document.createElement("span");
    nameSpan.className = "text-gray-600 font-medium mr-3";
    nameSpan.innerText = `Hi, ${user.name.split(" ")[0] || "Student"}`;

    const logoutBtn = document.createElement("button");
    logoutBtn.id = "logout-btn";
    logoutBtn.onclick = logoutUser;
    logoutBtn.className = "text-red-500 hover:text-red-700 font-bold ml-2";
    logoutBtn.innerText = "Logout";

    wrapper.appendChild(nameSpan);
    wrapper.appendChild(logoutBtn);

    if (navContainer) navContainer.appendChild(wrapper);

    // Mobile menu
    if (mobileMenu) {
      // remove any previous user blocks
      const existing = mobileMenu.querySelector(".auth-mobile-section");
      if (existing) existing.remove();
      const mobileHtml = document.createElement("div");
      mobileHtml.className = "auth-mobile-section border-t pt-2 mt-2 px-2";
      mobileHtml.innerHTML = `<p class="text-sm text-gray-600 mb-2">Signed in as <strong>${user.name}</strong></p>`;
      const outBtn = document.createElement("button");
      outBtn.className = "block w-full text-left py-2 text-red-500 font-bold";
      outBtn.innerText = "Logout";
      outBtn.onclick = logoutUser;
      mobileHtml.appendChild(outBtn);
      mobileMenu.appendChild(mobileHtml);
    }
  } else {
    // user is not logged in: add Login button
    if (navContainer) {
      const loginLink = document.createElement("a");
      loginLink.id = "nav-login-btn";
      loginLink.href = "login.html";
      loginLink.className =
        "bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ml-4 transition";
      loginLink.innerText = "Login";
      navContainer.appendChild(loginLink);
    }
    if (mobileMenu) {
      // ensure link not duplicated
      const existing = mobileMenu.querySelector(".mobile-login-link");
      if (!existing) {
        const a = document.createElement("a");
        a.className = "mobile-login-link block py-2 text-green-600 font-bold";
        a.href = "login.html";
        a.innerText = "Login / Sign Up";
        mobileMenu.appendChild(a);
      }
    }
  }
}

/* ---------------------------
   Enrollment UI action helper
   --------------------------- */

function enrollAndStart(courseId) {
  // AUTH CHECK: Force login if guest
  if (!getCurrentUser()) {
    alert("You must be logged in to enroll.");
    window.location.href = "login.html";
    return;
  }

  const course = getCourseById(courseId);
  if (!course) {
    alert("Course not found.");
    return;
  }

  // Mark enrolled
  enrollInCourse(courseId);

  // Save last visited as first lesson (helps dashboard)
  if (Array.isArray(course.lessons) && course.lessons.length > 0) {
    saveLastVisited(courseId, course.lessons[0].id);
    // Navigate to first lesson
    window.location.href = `lesson.html?courseId=${courseId}&lessonId=${course.lessons[0].id}`;
  } else {
    // No lessons: go to course detail
    window.location.href = `course-detail.html?id=${courseId}`;
  }
}

/* ---------------------------
   Event Listeners & Initialization
   --------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Mobile menu toggle (common across pages)
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (btn && menu) {
    btn.addEventListener("click", () => {
      menu.classList.toggle("hidden");
    });
  }

  // Ensure there is a courses array in memory (pages add a loader before script.js,
  // but we still set a fallback to avoid runtime errors)
  ensureCoursesLoadedSyncFallback();

  // Normalize user list at startup (migrate old data)
  const users = getUsers();
  saveUsers(users);

  // Update navbar/auth buttons
  updateAuthUI();

  // Expose a small global helper for debugging in dev console:
  window.__edupro_debug = {
    getCourses,
    getCourseById,
    getUsers,
    getCurrentUser,
    getProgress,
    calculateCourseProgress,
    saveUserProgress,
    saveQuizScore,
    completeLesson,
    enrollInCourse,
  };
});
