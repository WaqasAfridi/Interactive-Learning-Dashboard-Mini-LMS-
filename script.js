const STORAGE_KEY_USERS = "lmsUsers";
const STORAGE_KEY_SESSION = "lmsCurrentUser"; // Stores the email of logged in user
const PASS_SCORE = 3;

// --- Auth Utilities ---

function getUsers() {
  // Retrieves the array of all users
  const users = localStorage.getItem(STORAGE_KEY_USERS);
  return users ? JSON.parse(users) : [];
}

function saveUsers(users) {
  // Saves the updated array of all users back to localStorage
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

function getCurrentUser() {
  // Retrieves the currently logged-in user object
  const email = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!email) return null;
  const users = getUsers();
  return users.find((u) => u.email === email) || null;
}

function loginUser(email, password) {
  const users = getUsers();
  const user = users.find((u) => u.email === email && u.password === password);
  if (user) {
    localStorage.setItem(STORAGE_KEY_SESSION, user.email);
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
    // NOTE: A unique ID (e.g., Date.now()) is often better for keying,
    // but email is used as the unique identifier here.
    name,
    email,
    password,
    progress: {}, // IMPORTANT: This is the user-specific progress object
  };
  users.push(newUser);
  saveUsers(users);
  localStorage.setItem(STORAGE_KEY_SESSION, email); // Auto login
  return true;
}

function logoutUser() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
  window.location.href = "index.html";
}

function requireAuth() {
  if (!getCurrentUser()) {
    window.location.href = "login.html";
  }
}

// --- Progress Utilities (Fully User-Specific) ---

/**
 * 1️⃣ **NEW FUNCTION** required by dashboard.html to fetch all progress.
 * Retrieves the complete progress object {courseId: progressData, ...}
 * for the currently logged-in user.
 * @returns {Object} An object mapping course IDs to progress data, or an empty object.
 */
function getProgressDataForUser() {
  const user = getCurrentUser();
  // Progress data is stored directly in the user object's 'progress' property
  return user ? user.progress : {};
}



function getProgress(courseId) {
  // Retrieves progress for a specific course for the current user.
  const user = getCurrentUser();
  if (!user) return { completedLessons: [], quizScore: null }; // Fallback for guests

  const id = courseId.toString();
  // Progress is read from the user object's 'progress' property
  return user.progress[id] || { completedLessons: [], quizScore: null };
}

function saveUserProgress(courseId, courseProgressData) {
  // Saves updated course progress data back into the current user object in the global array.
  const user = getCurrentUser();
  if (!user) return false;

  const users = getUsers();
  const userIndex = users.findIndex((u) => u.email === user.email);

  if (userIndex !== -1) {
    // Init course object if missing
    if (!users[userIndex].progress) users[userIndex].progress = {};

    // Update the specific course progress
    users[userIndex].progress[courseId.toString()] = courseProgressData;
    saveUsers(users);
    return true;
  }
  return false;
}

function completeLesson(courseId, lessonId) {
  const user = getCurrentUser();
  if (!user) return false;

  let currentProgress = getProgress(courseId);

  if (!currentProgress.completedLessons.includes(lessonId)) {
    currentProgress.completedLessons.push(lessonId);
    currentProgress.completedLessons.sort((a, b) => a - b);
    saveUserProgress(courseId, currentProgress);
    return true;
  }
  return false;
}

function saveQuizScore(courseId, score) {
  const user = getCurrentUser();
  if (!user) return false;

  let currentProgress = getProgress(courseId);
  currentProgress.quizScore = score;
  saveUserProgress(courseId, currentProgress);
}

function calculateCourseProgress(courseId) {
  // Requires data.js to be loaded
  const course = coursesData.find((c) => c.id === courseId);
  if (!course) return 0;

  // Uses the user-specific getProgress()
  const progress = getProgress(courseId);
  const totalLessons = course.lessons.length;
  const hasQuiz = course.quiz && course.quiz.length > 0;

  const totalUnits = totalLessons + (hasQuiz ? 1 : 0);
  if (totalUnits === 0) return 0;

  let completedUnits = progress.completedLessons.length;
  if (hasQuiz && progress.quizScore !== null) {
    completedUnits += 1;
  }

  return Math.min(100, Math.floor((completedUnits / totalUnits) * 100));
}

// Mark a course as enrolled for the current user (idempotent)
function enrollInCourse(courseId) {
  const user = getCurrentUser();
  if (!user) return false;

  const users = getUsers();
  const idx = users.findIndex(u => u.email === user.email);
  if (idx === -1) return false;

  if (!users[idx].progress) users[idx].progress = {};

  const key = courseId.toString();
  if (!users[idx].progress[key]) {
    users[idx].progress[key] = {
      enrolled: true,
      completedLessons: [],
      quizScore: null
    };
  } else {
    // keep existing completedLessons/quizScore, just set enrolled flag
    users[idx].progress[key].enrolled = true;
    if (!Array.isArray(users[idx].progress[key].completedLessons)) {
      users[idx].progress[key].completedLessons = [];
    }
    if (!("quizScore" in users[idx].progress[key])) {
      users[idx].progress[key].quizScore = null;
    }
  }

  saveUsers(users);
  return true;
}

// Return only the course IDs that are considered "enrolled" for the current user
function getEnrolledCourseIdsForUser() {
  const prog = getProgressDataForUser() || {};
  return Object.keys(prog).filter((k) => {
    const entry = prog[k];
    // consider enrolled if explicit flag set OR there's progress (lessons/quiz)
    return (
      (entry && entry.enrolled) ||
      (entry && Array.isArray(entry.completedLessons) && entry.completedLessons.length > 0) ||
      (entry && entry.quizScore !== null && entry.quizScore !== undefined)
    );
  });
}

// Save last visited lesson for the current user
function saveLastVisited(courseId, lessonId) {
  const user = getCurrentUser();
  if (!user) return false;
  const users = getUsers();
  const idx = users.findIndex(u => u.email === user.email);
  if (idx === -1) return false;
  if (!users[idx].progress) users[idx].progress = {};
  const key = courseId.toString();
  if (!users[idx].progress[key]) users[idx].progress[key] = { enrolled: true, completedLessons: [], quizScore: null };
  users[idx].progress[key].lastVisited = lessonId;
  saveUsers(users);
  return true;
}

function getLastVisited(courseId) {
  const p = getProgress(courseId);
  return p && p.lastVisited ? p.lastVisited : null;
}

// --- UI Updates ---

function updateAuthUI() {
  const user = getCurrentUser();
  const navContainer = document.querySelector("nav .hidden.md\\:flex"); // Desktop Nav
  const mobileMenu = document.getElementById("mobile-menu");

  if (user) {
    // Desktop View: Replace "Dashboard" with User Dropdown/Logout
    if (!document.getElementById("logout-btn")) {
      const html = `
                <span class="text-gray-600 font-medium">Hi, ${
                  user.name.split(" ")[0]
                }</span>
                <button id="logout-btn" onclick="logoutUser()" class="text-red-500 hover:text-red-700 font-bold ml-4">Logout</button>
            `;
      // Append to desktop nav
      if (navContainer) {
        const div = document.createElement("div");
        div.className = "flex items-center ml-4";
        div.innerHTML = html;
        navContainer.appendChild(div);
      }

      // Append to mobile nav
      if (mobileMenu) {
        mobileMenu.innerHTML += `
                    <div class="border-t pt-2 mt-2">
                        <p class="px-2 text-gray-500">Signed in as ${user.name}</p>
                        <button onclick="logoutUser()" class="block w-full text-left py-2 text-red-500 font-bold">Logout</button>
                    </div>
                `;
      }
    }
  } else {
    // If not logged in, show Login button
    if (navContainer && !document.getElementById("nav-login-btn")) {
      const loginLink = document.createElement("a");
      loginLink.id = "nav-login-btn";
      loginLink.href = "login.html";
      loginLink.className =
        "bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ml-4 transition";
      loginLink.innerText = "Login";
      navContainer.appendChild(loginLink);

      if (mobileMenu) {
        mobileMenu.innerHTML += `<a href="login.html" class="block py-2 text-green-600 font-bold">Login / Sign Up</a>`;
      }
    }
  }
}

// --- Global Init ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Mobile Menu Toggle
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (btn && menu) {
    btn.addEventListener("click", () => {
      menu.classList.toggle("hidden");
    });
  }

  // 2. Update Navbar based on Auth state
  updateAuthUI();
});
