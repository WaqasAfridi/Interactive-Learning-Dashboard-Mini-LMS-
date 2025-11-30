// script.js — Updated with certificate generation, download & verification
const STORAGE_KEY_USERS = "lmsUsers";
const STORAGE_KEY_SESSION = "lmsCurrentUser"; // Stores the email of logged in user
const PASS_SCORE = 3;

/* ------------------------------------------------------------------
   Basic Auth / User / Progress utilities (kept & preserved + small
   defensive improvements). These are compatible with your pages.
   ------------------------------------------------------------------ */

function getUsers() {
  const users = localStorage.getItem(STORAGE_KEY_USERS);
  return users ? JSON.parse(users) : [];
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

function getCurrentUser() {
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
    name,
    email,
    password,
    progress: {}, // per-course progress and certificates
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

/* ------------------------------------------------------------------
   Progress functions (user-scoped).  Keep shape stable and defensive.
   ------------------------------------------------------------------ */

function getProgressDataForUser() {
  const user = getCurrentUser();
  return user ? user.progress || {} : {};
}

function getProgress(courseId) {
  const user = getCurrentUser();
  if (!user) return { completedLessons: [], quizScore: null };
  const id = courseId.toString();
  if (!user.progress) user.progress = {};
  return user.progress[id] || { completedLessons: [], quizScore: null };
}

function saveUserProgress(courseId, courseProgressData) {
  const user = getCurrentUser();
  if (!user) return false;

  const users = getUsers();
  const userIndex = users.findIndex((u) => u.email === user.email);
  if (userIndex === -1) return false;

  if (!users[userIndex].progress) users[userIndex].progress = {};
  users[userIndex].progress[courseId.toString()] = courseProgressData;
  saveUsers(users);
  return true;
}

function completeLesson(courseId, lessonId) {
  const user = getCurrentUser();
  if (!user) return false;

  let currentProgress = getProgress(courseId);
  if (!Array.isArray(currentProgress.completedLessons)) {
    currentProgress.completedLessons = [];
  }

  if (!currentProgress.completedLessons.includes(lessonId)) {
    currentProgress.completedLessons.push(lessonId);
    currentProgress.completedLessons.sort((a, b) => a - b);
    saveUserProgress(courseId, currentProgress);
    return true;
  }
  return false;
}

/**
 * Save quiz score and optionally create certificate record on pass.
 * This function will:
 *  - store quizScore in the user's progress
 *  - if score >= PASS_SCORE, create and store a certificate record
 */
function saveQuizScore(courseId, score) {
  const user = getCurrentUser();
  if (!user) return false;

  let currentProgress = getProgress(courseId);
  currentProgress.quizScore = score;
  saveUserProgress(courseId, currentProgress);

  // If passed, create certificate record (idempotent if already created)
  if (score >= PASS_SCORE) {
    try {
      saveCertificateRecord(courseId, score);
    } catch (err) {
      console.warn("saveCertificateRecord failed:", err);
    }
  }
  return true;
}

function calculateCourseProgress(courseId) {
  // Defensive: coursesData should be loaded beforehand
  const course = (window.coursesData || []).find((c) => c.id === courseId);
  if (!course) return 0;

  const progress = getProgress(courseId);
  const totalLessons = Array.isArray(course.lessons)
    ? course.lessons.length
    : 0;
  const hasQuiz = Array.isArray(course.quiz) && course.quiz.length > 0;
  const totalUnits = totalLessons + (hasQuiz ? 1 : 0);
  if (totalUnits === 0) return 0;

  const completedLessons = Array.isArray(progress.completedLessons)
    ? progress.completedLessons.length
    : 0;
  let completedUnits = completedLessons;
  if (
    hasQuiz &&
    progress.quizScore !== null &&
    progress.quizScore !== undefined
  )
    completedUnits += 1;

  return Math.min(100, Math.floor((completedUnits / totalUnits) * 100));
}

function enrollInCourse(courseId) {
  const user = getCurrentUser();
  if (!user) return false;

  const users = getUsers();
  const idx = users.findIndex((u) => u.email === user.email);
  if (idx === -1) return false;

  if (!users[idx].progress) users[idx].progress = {};

  const key = courseId.toString();
  if (!users[idx].progress[key]) {
    users[idx].progress[key] = {
      enrolled: true,
      completedLessons: [],
      quizScore: null,
      certificates: [], // store certificate records per course
      lastVisited: null,
    };
  } else {
    users[idx].progress[key].enrolled = true;
    if (!Array.isArray(users[idx].progress[key].completedLessons))
      users[idx].progress[key].completedLessons = [];
    if (!("quizScore" in users[idx].progress[key]))
      users[idx].progress[key].quizScore = null;
    if (!Array.isArray(users[idx].progress[key].certificates))
      users[idx].progress[key].certificates = [];
  }

  saveUsers(users);
  return true;
}

function getEnrolledCourseIdsForUser() {
  const prog = getProgressDataForUser() || {};
  return Object.keys(prog).filter((k) => {
    const entry = prog[k];
    return (
      (entry && entry.enrolled) ||
      (entry &&
        Array.isArray(entry.completedLessons) &&
        entry.completedLessons.length > 0) ||
      (entry && entry.quizScore !== null && entry.quizScore !== undefined)
    );
  });
}

function saveLastVisited(courseId, lessonId) {
  const user = getCurrentUser();
  if (!user) return false;
  const users = getUsers();
  const idx = users.findIndex((u) => u.email === user.email);
  if (idx === -1) return false;
  if (!users[idx].progress) users[idx].progress = {};
  const key = courseId.toString();
  if (!users[idx].progress[key])
    users[idx].progress[key] = {
      enrolled: true,
      completedLessons: [],
      quizScore: null,
      certificates: [],
      lastVisited: lessonId,
    };
  users[idx].progress[key].lastVisited = lessonId;
  saveUsers(users);
  return true;
}

function getLastVisited(courseId) {
  const p = getProgress(courseId);
  return p && p.lastVisited ? p.lastVisited : null;
}

/* ------------------------------------------------------------------
   UI helpers
   ------------------------------------------------------------------ */

function updateAuthUI() {
  const user = getCurrentUser();
  const navContainer = document.querySelector("nav .hidden.md\\:flex"); // Desktop Nav
  const mobileMenu = document.getElementById("mobile-menu");

  if (user) {
    if (!document.getElementById("logout-btn")) {
      const html = `
                <span class="text-gray-600 font-medium">Hi, ${
                  user.name.split(" ")[0]
                }</span>
                <button id="logout-btn" onclick="logoutUser()" class="text-red-500 hover:text-red-700 font-bold ml-4">Logout</button>
            `;
      if (navContainer) {
        const div = document.createElement("div");
        div.className = "flex items-center ml-4";
        div.innerHTML = html;
        navContainer.appendChild(div);
      }

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

/* ------------------------------------------------------------------
   CERTIFICATE IMPLEMENTATION
   - saves certificate metadata to user progress
   - exports PDF using html2canvas + jsPDF (loaded on demand)
   - printing support
   - verification helpers
   ------------------------------------------------------------------ */

/**
 * Create a short unique certificate id for a passed course.
 * Format: COURSEID-<timestamp36>-<random5>
 */
function generateCertificateId(courseId) {
  return `${courseId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/**
 * Save a certificate record into the current user's progress for the course.
 * A certificate record includes: id, date, score, courseTitle, issuer (EduPro)
 */
function saveCertificateRecord(courseId, score) {
  const user = getCurrentUser();
  if (!user) throw new Error("User must be logged in to save certificate.");

  const users = getUsers();
  const uIdx = users.findIndex((u) => u.email === user.email);
  if (uIdx === -1) throw new Error("Current user not found in storage.");

  if (!users[uIdx].progress) users[uIdx].progress = {};
  const key = courseId.toString();
  if (!users[uIdx].progress[key]) {
    users[uIdx].progress[key] = {
      enrolled: true,
      completedLessons: [],
      quizScore: null,
      certificates: [],
      lastVisited: null,
    };
  }
  if (!Array.isArray(users[uIdx].progress[key].certificates))
    users[uIdx].progress[key].certificates = [];

  // if a certificate with same score & date exists we still create a new one; but avoid duplicate id
  const certId = generateCertificateId(courseId);
  const cert = {
    id: certId,
    issuedOn: new Date().toISOString(),
    score: score,
    courseId: courseId,
    courseTitle:
      (window.coursesData || []).find((c) => c.id === courseId)?.title || "",
    issuer: "EduPro",
  };

  users[uIdx].progress[key].certificates.push(cert);

  // Also store last certificate id at top-level of that course progress (helpful)
  users[uIdx].progress[key].lastCertificateId = certId;

  saveUsers(users);
  return cert;
}

/**
 * Return array of certificate records for the currently logged-in user (all courses).
 */
function listCertificatesForUser() {
  const user = getCurrentUser();
  if (!user) return [];
  const progress = user.progress || {};
  const results = [];
  Object.keys(progress).forEach((courseId) => {
    const entry = progress[courseId];
    if (
      entry &&
      Array.isArray(entry.certificates) &&
      entry.certificates.length > 0
    ) {
      entry.certificates.forEach((c) => results.push(c));
    }
  });
  return results;
}

/**
 * Find certificate globally by ID (search all users). Useful for verification page.
 * Returns { valid: true/false, cert: {...}, user: {...} } or null if not found.
 */
function findCertificateById(certId) {
  const users = getUsers();
  for (const u of users) {
    if (!u.progress) continue;
    for (const k of Object.keys(u.progress)) {
      const entry = u.progress[k];
      if (!entry || !Array.isArray(entry.certificates)) continue;
      const found = entry.certificates.find((c) => c.id === certId);
      if (found)
        return {
          valid: true,
          cert: found,
          user: { name: u.name, email: u.email },
        };
    }
  }
  return null;
}

/* ---------- Certificate export (PDF) helpers ---------- */

/**
 * Dynamically load a script and return a Promise that resolves when loaded.
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Already loaded?
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error("Failed to load script " + src));
    document.head.appendChild(s);
  });
}

/**
 * Build a certificate DOM element (offscreen) for rendering/printing.
 * Returns the element (not attached or attached to body.hidden).
 */
function _buildCertificateElement(course, user, certRecord) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "1200px";
  wrapper.style.margin = "0 auto";
  wrapper.style.padding = "40px";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.fontFamily = "Georgia, 'Times New Roman', serif";
  wrapper.style.background = "#fff";

  // Outer box
  const outer = document.createElement("div");
  outer.style.border = "12px solid #1E40AF";
  outer.style.borderRadius = "12px";
  outer.style.padding = "28px";
  outer.style.textAlign = "center";
  outer.style.background = "#fff";

  // Title
  const title = document.createElement("div");
  title.innerHTML = `<p style="color:#6B7280;margin:0;font-size:18px;">CERTIFICATE OF COMPLETION</p>
                     <h1 style="font-size:48px;margin:6px 0;color:#0f172a;font-weight:700;font-family:Georgia, serif;">EduPro</h1>`;
  outer.appendChild(title);

  // Presented to
  const to = document.createElement("div");
  to.style.marginTop = "14px";
  to.innerHTML = `<p style="font-style:italic;color:#374151;margin:0;">This certificate is proudly presented to</p>
                  <h2 style="font-size:36px;margin:8px 0;color:#065f46;font-weight:700">${
                    (user && user.name) || "Student"
                  }</h2>
                  <p style="margin:8px 0;color:#374151;">for successfully completing the course</p>
                  <h3 style="font-size:28px;margin:10px 0;color:#0f172a;font-weight:700">${
                    (course && course.title) || ""
                  }</h3>`;
  outer.appendChild(to);

  // Meta row: date, score, cert id
  const meta = document.createElement("div");
  meta.style.marginTop = "22px";
  meta.style.display = "flex";
  meta.style.justifyContent = "center";
  meta.style.gap = "40px";
  meta.style.alignItems = "center";
  meta.innerHTML = `
    <div style="text-align:center"><div style="color:#6B7280;font-size:14px">Date</div><div style="font-weight:700">${new Date(
      certRecord.issuedOn
    ).toLocaleDateString()}</div></div>
    <div style="text-align:center"><div style="color:#6B7280;font-size:14px">Score</div><div style="font-weight:700">${
      certRecord.score
    }/${(course.quiz || []).length}</div></div>
    <div style="text-align:center"><div style="color:#6B7280;font-size:14px">Certificate ID</div><div style="font-weight:700;font-family:monospace">${
      certRecord.id
    }</div></div>
  `;
  outer.appendChild(meta);

  // Signature area
  const foot = document.createElement("div");
  foot.style.marginTop = "32px";
  foot.style.display = "flex";
  foot.style.justifyContent = "space-between";
  foot.style.alignItems = "center";

  foot.innerHTML = `
    <div style="text-align:left">
      <div style="font-weight:700">Instructor</div>
      <div style="color:#6B7280">John Doe</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:12px;color:#9CA3AF">Verified by EduPro</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700">Signature</div>
      <div style="color:#6B7280">________________</div>
    </div>
  `;

  outer.appendChild(foot);

  // Small footer line
  const small = document.createElement("div");
  small.style.marginTop = "18px";
  small.style.fontSize = "12px";
  small.style.color = "#9CA3AF";
  small.innerText =
    "Verify certificate at: (local) — use the Certificate ID to verify in the EduPro system.";
  outer.appendChild(small);

  wrapper.appendChild(outer);
  return wrapper;
}

/**
 * Export certificate for a given course for the current user as PDF.
 * If the course doesn't have a certificate record yet, it will use the
 * last certificate record for that course (if any).
 *
 * This function dynamically loads html2canvas and jsPDF from CDN.
 */
async function downloadCertificatePDF(courseId, options = {}) {
  const user = getCurrentUser();
  if (!user) {
    alert("Please log in to download certificate.");
    return;
  }

  // Find the certificate record (last one)
  const progress = getProgress(courseId);
  const certificates =
    progress && Array.isArray(progress.certificates)
      ? progress.certificates
      : [];
  if (!certificates || certificates.length === 0) {
    alert(
      "No certificate record found for this course. Make sure you've passed the quiz."
    );
    return;
  }
  const certRecord = certificates[certificates.length - 1];

  const course = (window.coursesData || []).find((c) => c.id === courseId);
  // Build DOM element
  const el = _buildCertificateElement(course, user, certRecord);
  // Put offscreen container
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  document.body.appendChild(el);

  try {
    // Load libraries
    await Promise.all([
      loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
      ),
      loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
      ),
    ]);

    // html2canvas render
    // eslint-disable-next-line no-undef
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    // Use jsPDF
    // eslint-disable-next-line no-undef
    const { jsPDF } = window.jspdf;
    // Create PDF with landscape orientation and A4-like sizing
    // Convert px to pt will be handled by jsPDF when using pixel units: we'll set unit 'px'
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);

    const safeCourseTitle =
      course && course.title ? course.title.replace(/[^\w\s-]/g, "") : "course";
    const namePart =
      user && user.name ? user.name.replace(/[^\w\s-]/g, "") : "student";
    const filename = `${safeCourseTitle}-${namePart}-${certRecord.id}.pdf`;

    pdf.save(filename);
  } catch (err) {
    console.error("Certificate export error:", err);
    alert(
      "An error occurred creating the PDF. You can still print the certificate using the Print button."
    );
  } finally {
    // cleanup
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }
}

/**
 * Open print dialog with a print-friendly certificate page
 */
function printCertificate(courseId) {
  const user = getCurrentUser();
  if (!user) {
    alert("Please log in to print certificate.");
    return;
  }
  const progress = getProgress(courseId);
  const certificates =
    progress && Array.isArray(progress.certificates)
      ? progress.certificates
      : [];
  if (!certificates || certificates.length === 0) {
    alert("No certificate found to print.");
    return;
  }
  const certRecord = certificates[certificates.length - 1];
  const course = (window.coursesData || []).find((c) => c.id === courseId);

  const el = _buildCertificateElement(course, user, certRecord);
  // New window
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    alert("Unable to open print window — check your popup blocker.");
    return;
  }
  printWindow.document.write(
    "<!doctype html><html><head><title>Certificate</title>"
  );
  // Inline minimal styles for printing
  printWindow.document.write(
    '<meta name="viewport" content="width=device-width,initial-scale=1">'
  );
  printWindow.document.write("</head><body>");
  printWindow.document.body.appendChild(el.cloneNode(true));
  printWindow.document.write("</body></html>");

  // Give the browser a short time to render (small delay)
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    // Optionally close after print:
    // printWindow.close();
  }, 500);
}

/* ------------------------------------------------------------------
   Certificate verification helper (for verify.html or dashboard)
   ------------------------------------------------------------------ */

function verifyCertificate(certId) {
  const found = findCertificateById(certId);
  if (!found) {
    return { valid: false };
  }
  return {
    valid: true,
    certificate: found.cert,
    studentName: found.user.name,
    studentEmail: found.user.email,
  };
}

/* ------------------------------------------------------------------
   Small convenience functions to expose actions globally so the
   HTML pages (course-detail, dashboard, quiz) can call them easily.
   ------------------------------------------------------------------ */

window.enrollAndStart = function (courseId) {
  // AUTH CHECK: Force login if guest
  if (!getCurrentUser()) {
    alert("You must be logged in to enroll.");
    window.location.href = "login.html";
    return;
  }

  const course = (window.coursesData || []).find(
    (c) => c.id === Number(courseId)
  );
  if (!course) {
    alert("Course not found.");
    return;
  }

  enrollInCourse(courseId);
  saveLastVisited(
    courseId,
    course.lessons && course.lessons[0] ? course.lessons[0].id : 1
  );
  window.location.href = `lesson.html?courseId=${courseId}&lessonId=${
    (course.lessons && course.lessons[0] && course.lessons[0].id) || 1
  }`;
};

window.downloadCertificatePDF = function (courseId) {
  downloadCertificatePDF(courseId);
};

window.printCertificate = function (courseId) {
  printCertificate(courseId);
};

window.verifyCertificate = function (certId) {
  // simple helper to show verification result
  const res = verifyCertificate(certId);
  if (!res.valid) {
    alert("Certificate not found or invalid.");
  } else {
    alert(
      `Certificate valid!\nCourse: ${res.certificate.courseTitle}\nStudent: ${
        res.studentName
      }\nIssued: ${new Date(res.certificate.issuedOn).toLocaleDateString()}`
    );
  }
  return res;
};

/* ------------------------------------------------------------------
   Global init: mobile menu and auth UI (kept)
   ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  // Mobile Menu Toggle
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (btn && menu) {
    btn.addEventListener("click", () => {
      menu.classList.toggle("hidden");
    });
  }

  // Update Navbar based on Auth state
  updateAuthUI();
});
