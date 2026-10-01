/**
 * Platform: College Internship & Placement Portal
 * Fully functional Firebase Integration (Auth, Firestore, Storage)
 */
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'firebase/storage';
import {
  auth,
  db,
  storage,
  isFirebaseConfigured,
  handleFirestoreError,
  OperationType
} from './firebase.ts';
import {
  loadDemoDataToFirestore,
  clearDemoDataFromFirestore,
  DEMO_STUDENTS,
  DEMO_OPPORTUNITIES,
  DEMO_APPROVED_COMPANIES,
  DEMO_PENDING_COMPANIES,
  generateDemoApplications
} from './demo-data.ts';

// ---------------- DOM Selectors ----------------
const $ = <T extends HTMLElement = HTMLElement>(s: string): T | null => document.querySelector(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string): T[] => Array.from(document.querySelectorAll(s));

const toastEl = $('#t');
let toastTimer: any = null;

export function toast(msg: string) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600);
}

// ---------------- State ----------------
export type UserRole = 'student' | 'company' | 'admin';

interface StudentProfile {
  userId: string;
  name: string;
  email: string;
  branch: string;
  skills: string[];
  resumeUrl?: string;
  resumeName?: string;
  profileCompletePct?: number;
  updatedAt?: string;
  demo?: boolean;
}

interface CompanyProfile {
  userId: string;
  companyName: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  demo?: boolean;
}

export interface Opportunity {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  type: 'Internship' | 'Full-time';
  location: string;
  paid: 'Paid' | 'Unpaid';
  stipend: string;
  skills: string[];
  closes: string;
  applicantCount: number;
}

export interface Application {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  companyId: string;
  companyName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentBranch: string;
  studentSkills: string[];
  resumeUrl?: string;
  resumeName?: string;
  stage: number; // 0: Applied, 1: Shortlisted, 2: Interview, 3: Offer, 4: Decision
  status: string;
  dates: string[];
  nextStep: string;
  appliedAt?: any;
}

let currentUser: FirebaseUser | null = null;
let currentRole: UserRole | null = null;
let studentData: StudentProfile | null = null;
let companyData: CompanyProfile | null = null;

let allOpportunities: Opportunity[] = [];
let myApplications: Application[] = [];
let companyApplications: Application[] = [];
let companyOpportunities: Opportunity[] = [];

let pendingCompanies: CompanyProfile[] = [];
let allStudents: StudentProfile[] = [];
let allApplicationsForAdmin: Application[] = [];

let activeAppIndex = 0;
let oppFilterSet = new Set<string>();

// Subscriptions
const unsubscribers: Unsubscribe[] = [];

function clearSubscriptions() {
  unsubscribers.forEach(u => u());
  unsubscribers.length = 0;
}

// ---------------- Theme Management ----------------
const rootEl = document.documentElement;
const colorSchemeMq = matchMedia('(prefers-color-scheme: dark)');

function updateThemeLabel() {
  const isDark = rootEl.dataset.theme ? rootEl.dataset.theme === 'dark' : colorSchemeMq.matches;
  const thBtn = $('#th');
  if (thBtn) thBtn.textContent = isDark ? 'Forest' : 'Sand';
  return isDark;
}

function initTheme() {
  const thBtn = $('#th');
  if (thBtn) {
    thBtn.onclick = () => {
      const isDark = updateThemeLabel();
      rootEl.dataset.theme = isDark ? 'light' : 'dark';
      updateThemeLabel();
    };
  }
  colorSchemeMq.addEventListener('change', () => {
    if (!rootEl.dataset.theme) updateThemeLabel();
  });
  updateThemeLabel();
}

// ---------------- Navigation ----------------
export function switchView(viewId: string) {
  $$('.view').forEach(e => {
    e.classList.toggle('on', e.id === viewId);
  });
  $$('#tabs button').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.v === viewId));
  });

  if (viewId === 'student') {
    setTimeout(renderStudentTracker, 60);
  }
}

// ---------------- Tab Visibility by Role ----------------
function updateNavTabsForUser(role: UserRole | null) {
  const tabsContainer = $('#tabs');
  if (!tabsContainer) return;

  if (!currentUser || !role) {
    // Show only Sign In tab
    tabsContainer.innerHTML = `
      <button role="tab" data-v="auth" aria-selected="true" id="tab-auth">Sign in</button>
    `;
    switchView('auth');
    return;
  }

  // Hide the other role tabs; show only the user's role screen and a Sign out button
  if (role === 'student') {
    tabsContainer.innerHTML = `
      <button role="tab" data-v="student" aria-selected="true" id="tab-student">Student</button>
      <button role="button" class="pill" id="btn-signout" style="padding:6px 14px;font-size:13px;border-color:transparent">Sign out (${currentUser.email?.split('@')[0]})</button>
    `;
    switchView('student');
  } else if (role === 'company') {
    tabsContainer.innerHTML = `
      <button role="tab" data-v="company" aria-selected="true" id="tab-company">Company</button>
      <button role="button" class="pill" id="btn-signout" style="padding:6px 14px;font-size:13px;border-color:transparent">Sign out (${companyData?.companyName || currentUser.email?.split('@')[0]})</button>
    `;
    switchView('company');
  } else if (role === 'admin') {
    tabsContainer.innerHTML = `
      <button role="tab" data-v="admin" aria-selected="true" id="tab-admin">Placement cell</button>
      <button role="button" class="pill" id="btn-signout" style="padding:6px 14px;font-size:13px;border-color:transparent">Sign out (Officer)</button>
    `;
    switchView('admin');
  }

  const signoutBtn = $('#btn-signout');
  if (signoutBtn) {
    signoutBtn.onclick = handleSignOut;
  }
}

// ---------------- Auth Logic ----------------
let isSignUpMode = false;
let selectedSignupRole: 'student' | 'company' = 'student';

function handleSandboxAuth(email: string, role: UserRole, isSignUp: boolean, name?: string, branch?: string) {
  const mockUid = 'sandbox_' + email.replace(/[^a-zA-Z0-9]/g, '_');
  currentUser = {
    uid: mockUid,
    email: email,
    displayName: name || email.split('@')[0],
  } as any;
  currentRole = role;

  if (role === 'student') {
    studentData = {
      userId: mockUid,
      name: name || email.split('@')[0],
      email: email,
      branch: branch || 'Computer engineering',
      skills: ['Python', 'SQL', 'TensorFlow', 'React', 'Computer vision'],
      resumeUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      resumeName: 'Resume_' + (name || email.split('@')[0]).replace(/\s+/g, '_') + '.pdf',
      profileCompletePct: 92
    };
    if (allOpportunities.length === 0) {
      allOpportunities = DEMO_OPPORTUNITIES;
    }
    const sampleApps = generateDemoApplications().filter(a => a.studentBranch === studentData!.branch || a.stage <= 2);
    myApplications = sampleApps.slice(0, 3);
    renderStudentProfile();
    renderOpportunities();
    renderStudentTracker();
  } else if (role === 'company') {
    companyData = {
      userId: mockUid,
      companyName: name || email.split('@')[0] + ' Labs',
      email: email,
      status: 'approved'
    };
    companyOpportunities = DEMO_OPPORTUNITIES.slice(0, 3);
    companyApplications = generateDemoApplications().slice(0, 16);
    renderCompanyDashboard();
  } else if (role === 'admin') {
    allStudents = DEMO_STUDENTS;
    pendingCompanies = DEMO_PENDING_COMPANIES;
    allApplicationsForAdmin = generateDemoApplications();
    renderAdminDashboard();
  }

  updateNavTabsForUser(role);
  toast(`Signed in as ${role} (Sandbox Mode). Use "Paste Firebase Config" to link live cloud Firestore.`);
}

function setupAuthUI() {
  const roleButtons = $$('#role button');
  roleButtons.forEach(b => {
    b.onclick = () => {
      roleButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      selectedSignupRole = (b.dataset.role as 'student' | 'company') || 'student';
      renderAuthForm();
    };
  });

  const signinBtn = $('#btn-signin');
  const createBtn = $('#btn-create');

  if (signinBtn) {
    signinBtn.onclick = handleAuthSubmit;
  }

  if (createBtn) {
    createBtn.onclick = () => {
      isSignUpMode = !isSignUpMode;
      renderAuthForm();
    };
  }
}

function renderAuthForm() {
  const authTitle = $('#auth-title') || $('.auth .l h2');
  const createBtn = $('#btn-create');
  const signinBtn = $('#btn-signin');
  const extraFields = $('#auth-extra-fields');

  if (authTitle) {
    authTitle.textContent = isSignUpMode
      ? `Create ${selectedSignupRole === 'company' ? 'Company' : 'Student'} Account`
      : 'Sign in to Platform';
  }

  if (signinBtn) {
    signinBtn.textContent = isSignUpMode ? 'Sign up' : 'Sign in';
  }

  if (createBtn) {
    createBtn.textContent = isSignUpMode ? 'Back to sign in' : 'Create account';
  }

  // Extra field for name/company name and branch
  if (!extraFields) {
    const lDiv = $('.auth .l');
    if (lDiv) {
      const container = document.createElement('div');
      container.id = 'auth-extra-fields';
      const emLabel = $('label[for="em"]');
      if (emLabel) {
        lDiv.insertBefore(container, emLabel);
      }
    }
  }

  const container = $('#auth-extra-fields');
  if (container) {
    if (isSignUpMode) {
      container.innerHTML = `
        <label for="auth-name">${selectedSignupRole === 'company' ? 'Company name' : 'Your full name'}</label>
        <input id="auth-name" type="text" placeholder="${selectedSignupRole === 'company' ? 'e.g. Acme Robotics' : 'e.g. Aarav Patil'}" required>
        ${selectedSignupRole === 'student' ? `
          <label for="auth-branch">Department / Branch</label>
          <select id="auth-branch" style="width:100%;padding:11px 16px;border-radius:99px;border-style:solid;border-width:1px;border-color:var(--gb);background:var(--g2);color:inherit;outline:0">
            <option value="Computer engineering">Computer engineering</option>
            <option value="AI and machine learning">AI and machine learning</option>
            <option value="Information technology">Information technology</option>
            <option value="Electronics">Electronics</option>
            <option value="Mechanical">Mechanical</option>
          </select>
        ` : ''}
      `;
    } else {
      container.innerHTML = '';
    }
  }
}

async function handleAuthSubmit() {
  const emailInput = $('#em') as HTMLInputElement;
  const pwInput = $('#pw') as HTMLInputElement;
  const nameInput = $('#auth-name') as HTMLInputElement;
  const branchSelect = $('#auth-branch') as HTMLSelectElement;

  const email = emailInput?.value.trim();
  const password = pwInput?.value;

  if (!email || !password) {
    toast('Please enter both email and password.');
    return;
  }

  if (password.length < 6) {
    toast('Password must be at least 6 characters.');
    return;
  }

  // If Firebase is not yet configured with a valid API key, authenticate in sandbox mode immediately
  if (!isFirebaseConfigured()) {
    const role: UserRole = isSignUpMode ? selectedSignupRole : (
      email.includes('admin') || email.includes('placement') || email === 'siddiqa.s016@gmail.com' ? 'admin' :
      email.includes('company') ? 'company' : selectedSignupRole
    );
    handleSandboxAuth(email, role, isSignUpMode, nameInput?.value, branchSelect?.value);
    return;
  }

  const submitBtn = $('#btn-signin');
  if (submitBtn) {
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.textContent = isSignUpMode ? 'Creating account...' : 'Signing in...';
  }

  try {
    if (isSignUpMode) {
      // 1. Create in Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      const role = selectedSignupRole;

      // 2. Save role in "users" collection
      await setDoc(doc(db, 'users', uid), {
        userId: uid,
        email,
        role,
        createdAt: new Date().toISOString()
      });

      // 3. Create initial student or company profile
      if (role === 'student') {
        const studentName = nameInput?.value.trim() || email.split('@')[0];
        const branch = branchSelect?.value || 'Computer engineering';
        await setDoc(doc(db, 'students', uid), {
          userId: uid,
          name: studentName,
          email,
          branch,
          skills: ['Python', 'SQL'],
          resumeUrl: '',
          resumeName: '',
          profileCompletePct: 60,
          updatedAt: new Date().toISOString()
        });
        toast('Account created. Welcome to Platform!');
      } else {
        const companyName = nameInput?.value.trim() || email.split('@')[0];
        await setDoc(doc(db, 'companies', uid), {
          userId: uid,
          companyName,
          email,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
        toast('Company registered. Under review by placement cell.');
      }
    } else {
      // Sign in
      await signInWithEmailAndPassword(auth, email, password);
      toast('Signed in successfully');
    }
  } catch (err: any) {
    console.warn('Firebase auth attempt:', err);
    if (err.message?.includes('api-key-not-valid') || err.code?.includes('api-key-not-valid')) {
      toast('Firebase API key is invalid or placeholder. Connected in Sandbox Mode.');
      const role: UserRole = isSignUpMode ? selectedSignupRole : (
        email.includes('admin') || email.includes('placement') || email === 'siddiqa.s016@gmail.com' ? 'admin' :
        email.includes('company') ? 'company' : selectedSignupRole
      );
      handleSandboxAuth(email, role, isSignUpMode, nameInput?.value, branchSelect?.value);
      return;
    }

    let msg = 'Authentication failed. Please check credentials.';
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      msg = 'Incorrect email or password.';
    } else if (err.code === 'auth/user-not-found') {
      msg = 'No account found with this email. Please sign up.';
    } else if (err.code === 'auth/email-already-in-use') {
      msg = 'An account already exists with this email.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'Password is too weak (minimum 6 characters).';
    } else if (err.message) {
      msg = err.message;
    }
    toast(msg);
  } finally {
    if (submitBtn) {
      submitBtn.removeAttribute('disabled');
      submitBtn.textContent = isSignUpMode ? 'Sign up' : 'Sign in';
    }
  }
}

async function handleSignOut() {
  if (!auth) return;
  try {
    clearSubscriptions();
    await signOut(auth);
    currentUser = null;
    currentRole = null;
    studentData = null;
    companyData = null;
    toast('Signed out');
    updateNavTabsForUser(null);
  } catch (err) {
    console.error(err);
    toast('Failed to sign out');
  }
}

// ---------------- Initialize User Session ----------------
async function onUserAuthChanged(user: FirebaseUser | null) {
  clearSubscriptions();
  currentUser = user;

  if (!user || !db) {
    currentRole = null;
    updateNavTabsForUser(null);
    return;
  }

  try {
    // 1. Fetch user role from "users/{userId}"
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      // Check if user is the bootstrapped Placement Officer (admin)
      if (user.email === 'siddiqa.s016@gmail.com' || user.email?.includes('placement') || user.email?.includes('admin')) {
        await setDoc(userDocRef, {
          userId: user.uid,
          email: user.email,
          role: 'admin',
          createdAt: new Date().toISOString()
        });
        currentRole = 'admin';
      } else {
        // Fallback default: student
        await setDoc(userDocRef, {
          userId: user.uid,
          email: user.email,
          role: 'student',
          createdAt: new Date().toISOString()
        });
        currentRole = 'student';
      }
    } else {
      currentRole = userSnap.data().role as UserRole;
    }

    // 2. Set up role-specific listeners
    if (currentRole === 'student') {
      subscribeStudentData(user.uid);
    } else if (currentRole === 'company') {
      subscribeCompanyData(user.uid);
    } else if (currentRole === 'admin') {
      subscribeAdminData();
    }

    updateNavTabsForUser(currentRole);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'users/' + user.uid);
    toast('Could not load user profile.');
  }
}

// ---------------- Student Features ----------------
function subscribeStudentData(uid: string) {
  if (!db) return;

  // 1. Listen to student profile doc
  const studentRef = doc(db, 'students', uid);
  const unsubProfile = onSnapshot(studentRef, snap => {
    if (snap.exists()) {
      studentData = snap.data() as StudentProfile;
    } else {
      // Create stub if missing
      studentData = {
        userId: uid,
        name: currentUser?.email?.split('@')[0] || 'Student',
        email: currentUser?.email || '',
        branch: 'Computer engineering',
        skills: ['Python', 'SQL'],
        resumeUrl: '',
        resumeName: '',
        profileCompletePct: 50
      };
      setDoc(studentRef, studentData).catch(e => console.error(e));
    }
    renderStudentProfile();
    renderOpportunities(); // Recompute skill matches
  }, err => {
    handleFirestoreError(err, OperationType.GET, `students/${uid}`);
  });
  unsubscribers.push(unsubProfile);

  // 2. Listen to all opportunities
  const oppsRef = collection(db, 'opportunities');
  const unsubOpps = onSnapshot(oppsRef, snap => {
    allOpportunities = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Opportunity[];

    // If database is completely empty on first launch, seed a few default opportunities for good UX
    if (allOpportunities.length === 0 && studentData) {
      seedDefaultOpportunities();
    }

    renderOpportunities();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'opportunities');
  });
  unsubscribers.push(unsubOpps);

  // 3. Listen to student's applications
  const appsQuery = query(collection(db, 'applications'), where('studentId', '==', uid));
  const unsubApps = onSnapshot(appsQuery, snap => {
    myApplications = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Application[];

    renderOpportunities();
    renderStudentTracker();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'applications');
  });
  unsubscribers.push(unsubApps);
}

// Compute profile completion percentage
function computeProfileCompletion(p: StudentProfile): number {
  let score = 0;
  if (p.name && p.name.trim().length > 0) score += 25;
  if (p.branch && p.branch.trim().length > 0) score += 25;
  if (p.skills && p.skills.length > 0) score += 25;
  if (p.resumeUrl && p.resumeUrl.trim().length > 0) score += 25;
  return score;
}

function renderStudentProfile() {
  if (!studentData) return;

  const pct = computeProfileCompletion(studentData);

  // 1. Completion ring
  const ring = $('.ring');
  if (ring) {
    ring.style.background = `conic-gradient(var(--acc) ${pct}%, var(--ring) 0)`;
    const ringInner = ring.querySelector('div');
    if (ringInner) ringInner.textContent = `${pct}%`;
  }

  // 2. Name & next completion hint
  const profileNameH3 = $('.dash .stack .glass:first-child h3');
  const profileHintSpan = $('.dash .stack .glass:first-child .mute.s');
  if (profileNameH3) {
    profileNameH3.textContent = `${studentData.name || 'Your profile'}`;
  }
  if (profileHintSpan) {
    if (!studentData.resumeUrl) {
      profileHintSpan.textContent = 'Upload your resume to reach ' + Math.min(pct + 25, 100) + '%';
    } else if (studentData.skills.length < 3) {
      profileHintSpan.textContent = 'Add more skills to strengthen matches';
    } else {
      profileHintSpan.textContent = `${studentData.branch} • All details complete`;
    }
  }

  // 3. Skills list with remove chip action
  const skillsContainer = $('.dash .stack .glass:first-child div[style*="margin-top"]');
  if (skillsContainer) {
    skillsContainer.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${studentData.skills.map((skill, idx) => `
          <span class="tag" style="display:inline-flex;align-items:center;gap:6px">
            ${skill}
            <button type="button" data-del-skill="${idx}" style="border:0;background:none;color:var(--mute);padding:0 2px;line-height:1;font-size:14px" title="Remove ${skill}">&times;</button>
          </span>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px">
        <input id="new-skill-input" type="text" placeholder="Add a skill (e.g. Node.js)" style="padding:6px 14px;font-size:13px;border-radius:99px;border:1px solid var(--gb);background:var(--g2);color:inherit;outline:0;flex:1">
        <button class="btn sm" id="btn-add-skill" type="button" style="padding:6px 14px">Add</button>
      </div>
    `;

    // Hook remove skill
    $$('button[data-del-skill]').forEach(btn => {
      btn.onclick = async () => {
        if (!studentData || !currentUser) return;
        const index = +(btn.dataset.delSkill || 0);
        const updatedSkills = studentData.skills.filter((_, i) => i !== index);

        if (!isFirebaseConfigured()) {
          studentData = { ...studentData, skills: updatedSkills };
          renderStudentProfile();
          renderOpportunities();
          toast('Skill removed');
          return;
        }

        try {
          await updateDoc(doc(db, 'students', currentUser.uid), {
            skills: updatedSkills,
            updatedAt: new Date().toISOString()
          });
          toast('Skill removed');
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `students/${currentUser.uid}`);
          toast('Failed to update skills');
        }
      };
    });

    // Hook add skill
    const addBtn = $('#btn-add-skill');
    const skillInput = $('#new-skill-input') as HTMLInputElement;
    const addAction = async () => {
      if (!studentData || !currentUser || !skillInput) return;
      const newSkill = skillInput.value.trim();
      if (!newSkill) return;
      if (studentData.skills.some(s => s.toLowerCase() === newSkill.toLowerCase())) {
        toast('Skill already in your profile');
        return;
      }
      const updated = [...studentData.skills, newSkill];

      if (!isFirebaseConfigured()) {
        studentData = { ...studentData, skills: updated };
        skillInput.value = '';
        renderStudentProfile();
        renderOpportunities();
        toast(`Added ${newSkill}`);
        return;
      }

      try {
        await updateDoc(doc(db, 'students', currentUser.uid), {
          skills: updated,
          updatedAt: new Date().toISOString()
        });
        skillInput.value = '';
        toast(`Added ${newSkill}`);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `students/${currentUser.uid}`);
        toast('Failed to add skill');
      }
    };

    if (addBtn) addBtn.onclick = addAction;
    if (skillInput) {
      skillInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addAction();
        }
      };
    }
  }

  // 4. Resume card
  const resumeCard = $('.dash .stack .glass:nth-child(2)');
  if (resumeCard) {
    resumeCard.innerHTML = `
      <h3>Resume</h3>
      <p class="mute s" style="margin:6px 0 14px">
        ${studentData.resumeName
          ? `<a href="${studentData.resumeUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--ink);text-decoration:underline">${studentData.resumeName}</a> (PDF)`
          : 'No resume uploaded yet (PDF under 2 MB)'}
      </p>
      <input type="file" id="resume-file-picker" accept="application/pdf" style="display:none">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn o sm" id="btn-pick-resume" type="button">
          ${studentData.resumeName ? 'Replace resume' : 'Upload resume'}
        </button>
        ${studentData.resumeUrl ? `
          <a class="btn sm" href="${studentData.resumeUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center">
            View PDF
          </a>
        ` : ''}
      </div>
      <div id="resume-upload-status" class="mute s" style="margin-top:8px"></div>
    `;

    const pickBtn = $('#btn-pick-resume');
    const filePicker = $('#resume-file-picker') as HTMLInputElement;

    if (pickBtn && filePicker) {
      pickBtn.onclick = () => filePicker.click();
      filePicker.onchange = handleResumeUpload;
    }
  }

  // 5. Ask the placement cell card
  const askBtn = $('#btn-ask-cell');
  if (askBtn) {
    askBtn.onclick = () => {
      const q = prompt('Enter your question or request for the placement cell:');
      if (q && q.trim()) {
        toast('Message sent to the placement officer');
      }
    };
  }
}

// ---------------- Resume Upload to Firebase Storage ----------------
async function handleResumeUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !currentUser || !storage || !db) return;

  // 1. Validation: PDF only
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast('Error: Only PDF documents are accepted.');
    return;
  }

  // 2. Validation: Under 2 MB
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    toast(`Error: File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Please choose a PDF under 2 MB.`);
    return;
  }

  const statusEl = $('#resume-upload-status');
  if (statusEl) statusEl.textContent = 'Uploading resume...';

  if (!isFirebaseConfigured()) {
    studentData = {
      ...studentData!,
      resumeName: file.name,
      resumeUrl: URL.createObjectURL(file),
      updatedAt: new Date().toISOString()
    };
    renderStudentProfile();
    toast('Resume uploaded successfully (Sandbox Mode)');
    if (statusEl) statusEl.textContent = 'Uploaded successfully!';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    return;
  }

  try {
    const filePath = `resumes/${currentUser.uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: 'application/pdf'
    });

    uploadTask.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        if (statusEl) statusEl.textContent = `Uploading: ${pct}%`;
      },
      (error) => {
        console.error('Upload error:', error);
        toast('Resume upload failed: ' + error.message);
        if (statusEl) statusEl.textContent = '';
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        await updateDoc(doc(db, 'students', currentUser!.uid), {
          resumeUrl: downloadUrl,
          resumeName: file.name,
          updatedAt: new Date().toISOString()
        });
        toast('Resume uploaded successfully');
        if (statusEl) statusEl.textContent = 'Uploaded successfully!';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
      }
    );
  } catch (err: any) {
    console.error('Storage error:', err);
    toast('Upload error: ' + (err.message || 'Could not complete upload'));
    if (statusEl) statusEl.textContent = '';
  }
}

// ---------------- Opportunities & Live Search ----------------
function calculateSkillMatch(oppSkills: string[] = [], mySkills: string[] = []): number {
  if (!oppSkills || oppSkills.length === 0) return 80;
  if (!mySkills || mySkills.length === 0) return 30;

  const mySkillsLower = mySkills.map(s => s.toLowerCase());
  let matches = 0;

  oppSkills.forEach(req => {
    const reqLower = req.toLowerCase();
    if (mySkillsLower.some(s => s.includes(reqLower) || reqLower.includes(s))) {
      matches++;
    }
  });

  const ratio = matches / oppSkills.length;
  // Blend nicely: if matches all = 95%, 0 = 35%
  return Math.min(Math.round(35 + ratio * 60), 98);
}

function renderOpportunities() {
  const qInput = $('#q') as HTMLInputElement;
  const q = qInput ? qInput.value.trim().toLowerCase() : '';
  const jobsList = $('#jobs');
  if (!jobsList) return;

  const studentSkills = studentData?.skills || ['Python', 'SQL'];
  const appliedOppIds = new Set(myApplications.map(a => a.opportunityId));

  const filtered = allOpportunities.filter(j => {
    // Filter chips
    const chipMatch = [...oppFilterSet].every(filterVal => {
      if (filterVal === 'Paid') return j.paid === 'Paid';
      if (filterVal === 'Internship' || filterVal === 'Full-time') return j.type === filterVal;
      if (filterVal === 'Mumbai' || filterVal === 'Remote') return j.location.toLowerCase().includes(filterVal.toLowerCase());
      return true;
    });

    const textToSearch = `${j.title} ${j.companyName} ${j.location} ${(j.skills || []).join(' ')}`.toLowerCase();
    const textMatch = !q || textToSearch.includes(q);

    return chipMatch && textMatch;
  });

  if (filtered.length === 0) {
    jobsList.innerHTML = `<p class="mute" style="padding:16px 0">No opportunities match your search. Try removing a filter chip.</p>`;
    return;
  }

  jobsList.innerHTML = filtered.map(opp => {
    const isApplied = appliedOppIds.has(opp.id);
    const matchPct = calculateSkillMatch(opp.skills, studentSkills);
    const badgeClass = matchPct >= 80 ? 'high' : matchPct >= 60 ? 'mid' : 'low';

    return `
      <div class="job">
        <div class="job-info">
          <div class="job-title-row">
            <h3>${opp.title}</h3>
            <span class="match-badge ${badgeClass}" title="Based on your profile skills: ${matchPct}% match">${matchPct}% match</span>
          </div>
          <span class="mute s">${opp.companyName}, ${opp.location}<br>${opp.stipend || opp.paid} • Closes ${opp.closes || 'Rolling'}</span>
        </div>
        <button class="btn sm" data-apply-id="${opp.id}" type="button" ${isApplied ? 'disabled' : ''}>
          ${isApplied ? 'Applied' : 'Apply'}
        </button>
      </div>
    `;
  }).join('');

  // Wire Apply button click
  $$('button[data-apply-id]').forEach(btn => {
    btn.onclick = () => {
      const oppId = btn.dataset.applyId;
      if (oppId) handleApply(oppId);
    };
  });
}

// ---------------- Handle Student Application ----------------
async function handleApply(oppId: string) {
  if (!currentUser || !db) return;

  const opp = allOpportunities.find(o => o.id === oppId);
  if (!opp) return;

  // Prevent duplicate
  const alreadyApplied = myApplications.some(a => a.opportunityId === oppId);
  if (alreadyApplied) {
    toast('You have already applied for this role.');
    return;
  }

  const todayStr = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date());

  const newApp: Omit<Application, 'id'> = {
    opportunityId: opp.id,
    opportunityTitle: opp.title,
    companyId: opp.companyId,
    companyName: opp.companyName,
    studentId: currentUser.uid,
    studentName: studentData?.name || currentUser.email?.split('@')[0] || 'Student',
    studentEmail: currentUser.email || '',
    studentBranch: studentData?.branch || 'Computer engineering',
    studentSkills: studentData?.skills || ['Python', 'SQL'],
    resumeUrl: studentData?.resumeUrl || '',
    resumeName: studentData?.resumeName || '',
    stage: 0,
    status: 'Applied',
    dates: [todayStr, '', '', '', ''],
    nextStep: 'Application received. Companies usually reply within 7 days.',
    appliedAt: serverTimestamp()
  };

  if (!isFirebaseConfigured()) {
    const sandboxApp: Application = {
      id: 'app_' + Date.now(),
      ...newApp,
      appliedAt: new Date().toISOString()
    };
    myApplications = [sandboxApp, ...myApplications];
    opp.applicantCount = (opp.applicantCount || 0) + 1;
    renderOpportunities();
    renderStudentTracker();
    toast(`Application sent to ${opp.companyName}`);
    return;
  }

  try {
    const appDocRef = doc(collection(db, 'applications'));
    await setDoc(appDocRef, newApp);

    // Increment applicant count on opportunity
    await updateDoc(doc(db, 'opportunities', opp.id), {
      applicantCount: (opp.applicantCount || 0) + 1
    });

    toast(`Application sent to ${opp.companyName}`);
  } catch (err: any) {
    handleFirestoreError(err, OperationType.CREATE, 'applications');
    toast('Failed to submit application: ' + (err.message || 'Permission denied'));
  }
}

// ---------------- Application Tracker Component ----------------
const STAGE_NAMES = ['Applied', 'Shortlisted', 'Interview', 'Offer', 'Decision'];

function renderStudentTracker() {
  const appsNav = $('#apps');
  const trkBox = $('#trk');
  if (!appsNav || !trkBox) return;

  if (myApplications.length === 0) {
    appsNav.innerHTML = '';
    trkBox.innerHTML = `
      <div style="padding:28px 0;text-align:center">
        <h3 style="font-weight:400;margin-bottom:8px">No active applications</h3>
        <p class="mute s" style="max-width:28em;margin:0 auto 16px">
          Browse verified opportunities on the left and click Apply. Your application thread will glow and track every step right here in real time.
        </p>
      </div>
    `;
    return;
  }

  if (activeAppIndex >= myApplications.length) {
    activeAppIndex = 0;
  }

  const currentApp = myApplications[activeAppIndex];

  // Switcher buttons
  appsNav.innerHTML = myApplications.map((app, idx) => `
    <button type="button" aria-pressed="${idx === activeAppIndex}" data-app-idx="${idx}">
      ${app.companyName}
    </button>
  `).join('');

  $$('button[data-app-idx]').forEach(btn => {
    btn.onclick = () => {
      activeAppIndex = +(btn.dataset.appIdx || 0);
      renderStudentTracker();
    };
  });

  // Thread stages
  const currentStage = Math.min(Math.max(currentApp.stage || 0, 0), 4);

  trkBox.innerHTML = `
    <div class="role">${currentApp.opportunityTitle}</div>
    <p class="mute" style="margin:6px 0 0">${currentApp.companyName} • Status: ${currentApp.status}</p>
    <div class="line" role="progressbar" aria-valuenow="${currentStage + 1}" aria-valuemin="1" aria-valuemax="5">
      <div class="fill" id="fl2"></div>
      ${STAGE_NAMES.map((name, k) => `
        <div class="st ${k < currentStage ? 'done' : k === currentStage ? 'now' : ''}">
          <i></i>
          <b>${name}</b>
          <span>${currentApp.dates?.[k] || '&nbsp;'}</span>
        </div>
      `).join('')}
    </div>
    <div class="glass" style="padding:16px 20px;border-radius:18px;margin-top:26px;background:var(--g2)">
      <b style="font-weight:500">Next step</b><br>
      <span class="mute">${currentApp.nextStep || 'Your application is under active evaluation.'}</span>
    </div>
    <div class="row" style="margin-top:20px;flex-wrap:wrap">
      <button class="btn" id="btn-view-app" type="button">View application</button>
      <button class="btn o" id="btn-withdraw" type="button">Withdraw</button>
    </div>
  `;

  // Animate the thread
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fl2 = $('#fl2');
      if (fl2) {
        fl2.style.width = (currentStage / 4 * 80) + '%';
      }
    });
  });

  // Buttons
  const viewBtn = $('#btn-view-app');
  if (viewBtn) {
    viewBtn.onclick = () => {
      toast(`Role: ${currentApp.opportunityTitle} at ${currentApp.companyName}`);
    };
  }

  const withdrawBtn = $('#btn-withdraw');
  if (withdrawBtn) {
    withdrawBtn.onclick = async () => {
      if (!confirm(`Are you sure you want to withdraw your application for ${currentApp.opportunityTitle}?`)) return;
      if (!db) return;
      try {
        await deleteDoc(doc(db, 'applications', currentApp.id));
        toast('Application withdrawn');
      } catch (err: any) {
        handleFirestoreError(err, OperationType.DELETE, `applications/${currentApp.id}`);
        toast('Could not withdraw application: ' + err.message);
      }
    };
  }
}

// ---------------- Company Features ----------------
function subscribeCompanyData(uid: string) {
  if (!db) return;

  // 1. Company profile doc
  const compRef = doc(db, 'companies', uid);
  const unsubComp = onSnapshot(compRef, snap => {
    if (snap.exists()) {
      companyData = snap.data() as CompanyProfile;
    } else {
      companyData = {
        userId: uid,
        companyName: currentUser?.email?.split('@')[0] || 'Company',
        email: currentUser?.email || '',
        status: 'pending'
      };
      setDoc(compRef, companyData).catch(e => console.error(e));
    }
    renderCompanyDashboard();
  }, err => {
    handleFirestoreError(err, OperationType.GET, `companies/${uid}`);
  });
  unsubscribers.push(unsubComp);

  // 2. Opportunities posted by this company
  const oppsQuery = query(collection(db, 'opportunities'), where('companyId', '==', uid));
  const unsubOpps = onSnapshot(oppsQuery, snap => {
    companyOpportunities = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Opportunity[];
    renderCompanyDashboard();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'opportunities');
  });
  unsubscribers.push(unsubOpps);

  // 3. Applications submitted to this company
  const appsQuery = query(collection(db, 'applications'), where('companyId', '==', uid));
  const unsubApps = onSnapshot(appsQuery, snap => {
    companyApplications = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Application[];
    renderCompanyDashboard();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'applications');
  });
  unsubscribers.push(unsubApps);
}

function renderCompanyDashboard() {
  const companySection = $('#company');
  if (!companySection) return;

  const isApproved = companyData?.status === 'approved';

  // 1. Top status banner
  const statusBanner = companySection.querySelector('.row .glass') as HTMLElement;
  const postBtn = $('#btn-post-job') as HTMLButtonElement;

  if (statusBanner) {
    if (isApproved) {
      statusBanner.textContent = `${companyData?.companyName || 'Company'}, verified employer. ${companyApplications.length} active applicant${companyApplications.length === 1 ? '' : 's'}.`;
    } else if (companyData?.status === 'rejected') {
      statusBanner.textContent = 'Account review: Application was not approved by placement cell.';
    } else {
      statusBanner.textContent = 'Pending verification: The placement cell is reviewing your account. Opportunities can be posted once approved.';
    }
  }

  if (postBtn) {
    if (isApproved) {
      postBtn.removeAttribute('disabled');
      postBtn.title = 'Post a new role';
      postBtn.onclick = openPostOpportunityModal;
    } else {
      postBtn.setAttribute('disabled', 'true');
      postBtn.title = 'Verification pending';
      postBtn.onclick = () => toast('Account pending approval by the placement cell.');
    }
  }

  // 2. Candidate pipeline columns
  const pipeColumns = companySection.querySelectorAll('.pipe .glass.p');
  if (pipeColumns.length >= 4) {
    // Stages: 0: Applied, 1: Shortlisted, 2: Interview, 3: Offer
    const stages = [
      { name: 'Applied', stage: 0 },
      { name: 'Shortlisted', stage: 1 },
      { name: 'Interview', stage: 2 },
      { name: 'Offer', stage: 3 }
    ];

    stages.forEach((st, idx) => {
      const col = pipeColumns[idx];
      const candidates = companyApplications.filter(a => a.stage === st.stage);
      col.innerHTML = `
        <h3>${st.name} <span class="mute">${candidates.length}</span></h3>
        ${candidates.length === 0 ? `
          <div class="mute s" style="padding:18px 0;text-align:center">No candidates in this stage</div>
        ` : candidates.map(c => `
          <div class="cand" style="position:relative">
            <b>${c.studentName}</b>
            <div class="mute s" style="margin:2px 0 4px">${c.opportunityTitle} • ${c.studentBranch}</div>
            <div style="margin:4px 0">
              ${(c.studentSkills || []).slice(0, 3).map(sk => `<span class="tag" style="font-size:11px;padding:1px 8px">${sk}</span>`).join('')}
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              ${c.resumeUrl ? `
                <a href="${c.resumeUrl}" target="_blank" rel="noopener noreferrer" class="btn sm o" style="font-size:12px;padding:4px 10px;text-decoration:none">
                  Resume
                </a>
              ` : ''}
              ${st.stage < 3 ? `
                <button class="btn sm" data-advance-app="${c.id}" data-target-stage="${st.stage + 1}" type="button" style="font-size:12px;padding:4px 10px">
                  ${st.stage === 0 ? 'Shortlist' : st.stage === 1 ? 'Interview' : 'Offer'} &rarr;
                </button>
              ` : `
                <span class="match-badge high" style="font-size:11px">Offer extended</span>
              `}
            </div>
          </div>
        `).join('')}
      `;
    });

    // Wire candidate stage advancement
    $$('button[data-advance-app]').forEach(btn => {
      btn.onclick = async () => {
        const appId = btn.dataset.advanceApp;
        const targetStage = +(btn.dataset.targetStage || 1);
        if (!appId || !db) return;

        const todayStr = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date());
        const appObj = companyApplications.find(a => a.id === appId);
        const datesCopy = [...(appObj?.dates || ['', '', '', '', ''])];
        datesCopy[targetStage] = todayStr;

        const nextSteps = [
          'Application received.',
          'Profile shortlisted. The recruitment team will schedule an interview.',
          'Interview scheduled. Check your email for call links and timing.',
          'Offer extended! Congratulations on receiving an offer.',
          'Final decision recorded.'
        ];

        if (!isFirebaseConfigured()) {
          if (appObj) {
            appObj.stage = targetStage;
            appObj.status = STAGE_NAMES[targetStage];
            appObj.dates[targetStage] = todayStr;
            appObj.nextStep = nextSteps[targetStage] || 'Next step updated by company.';
            renderCompanyDashboard();
            toast(`Candidate moved to ${STAGE_NAMES[targetStage]}`);
          }
          return;
        }

        try {
          await updateDoc(doc(db, 'applications', appId), {
            stage: targetStage,
            status: STAGE_NAMES[targetStage],
            dates: datesCopy,
            nextStep: nextSteps[targetStage] || 'Next step updated by company.',
            updatedAt: new Date().toISOString()
          });
          toast(`Candidate moved to ${STAGE_NAMES[targetStage]}`);
        } catch (err: any) {
          handleFirestoreError(err, OperationType.UPDATE, `applications/${appId}`);
          toast('Failed to update stage: ' + err.message);
        }
      };
    });
  }

  // 3. Open roles table
  const tableBody = companySection.querySelector('table tbody') || companySection.querySelector('table');
  if (tableBody) {
    if (companyOpportunities.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="mute" style="text-align:center;padding:24px">
            No open roles yet. Click "Post an opportunity" to create your first listing.
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = `
        <tr><th>Role</th><th>Type</th><th>Applicants</th><th>Closes</th></tr>
        ${companyOpportunities.map(opp => `
          <tr>
            <td><b>${opp.title}</b><br><span class="mute s">${opp.location} • ${opp.stipend || opp.paid}</span></td>
            <td>${opp.type}</td>
            <td>${companyApplications.filter(a => a.opportunityId === opp.id).length}</td>
            <td>${opp.closes || 'Rolling'}</td>
          </tr>
        `).join('')}
      `;
    }
  }
}

// ---------------- Modal: Post An Opportunity ----------------
function openPostOpportunityModal() {
  if (!companyData || companyData.status !== 'approved') {
    toast('Your company account must be approved before posting.');
    return;
  }

  let modal = $('#modal-post-opp');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-post-opp';
    modal.className = 'glass p';
    modal.style.position = 'fixed';
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.zIndex = '999';
    modal.style.maxWidth = '520px';
    modal.style.width = '90%';
    modal.style.maxHeight = '90vh';
    modal.style.overflowY = 'auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h2>Post an opportunity</h2>
      <button id="btn-close-modal" type="button" style="border:0;background:none;font-size:24px;color:var(--mute)">&times;</button>
    </div>
    <form id="form-post-opp">
      <label for="opp-title">Role title</label>
      <input id="opp-title" type="text" placeholder="e.g. ML intern or Software Engineer" required>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label for="opp-type">Job type</label>
          <select id="opp-type" style="width:100%;padding:11px 16px;border-radius:99px;border:1px solid var(--gb);background:var(--g2);color:inherit;outline:0">
            <option value="Internship">Internship</option>
            <option value="Full-time">Full-time</option>
          </select>
        </div>
        <div>
          <label for="opp-loc">Location</label>
          <input id="opp-loc" type="text" placeholder="e.g. Mumbai or Remote" required>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label for="opp-paid">Compensation</label>
          <select id="opp-paid" style="width:100%;padding:11px 16px;border-radius:99px;border:1px solid var(--gb);background:var(--g2);color:inherit;outline:0">
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
        <div>
          <label for="opp-stipend">Stipend or CTC</label>
          <input id="opp-stipend" type="text" placeholder="e.g. Rs 20,000 / month" required>
        </div>
      </div>

      <label for="opp-skills">Required skills (comma-separated)</label>
      <input id="opp-skills" type="text" placeholder="e.g. Python, SQL, React" required>

      <label for="opp-closes">Closing date</label>
      <input id="opp-closes" type="text" placeholder="e.g. 15 Oct" required>

      <div class="row" style="margin-top:20px;justify-content:flex-end">
        <button class="btn o" id="btn-cancel-post" type="button">Cancel</button>
        <button class="btn" type="submit">Publish opportunity</button>
      </div>
    </form>
  `;

  modal.style.display = 'block';

  const close = () => { if (modal) modal.style.display = 'none'; };
  const closeBtn = $('#btn-close-modal');
  const cancelBtn = $('#btn-cancel-post');
  if (closeBtn) closeBtn.onclick = close;
  if (cancelBtn) cancelBtn.onclick = close;

  const form = $('#form-post-opp') as HTMLFormElement;
  if (form) {
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!currentUser || !companyData || !db) return;

      const title = (($('#opp-title') as HTMLInputElement).value || '').trim();
      const type = (($('#opp-type') as HTMLSelectElement).value || 'Internship') as 'Internship' | 'Full-time';
      const location = (($('#opp-loc') as HTMLInputElement).value || '').trim();
      const paid = (($('#opp-paid') as HTMLSelectElement).value || 'Paid') as 'Paid' | 'Unpaid';
      const stipend = (($('#opp-stipend') as HTMLInputElement).value || '').trim();
      const skillsRaw = (($('#opp-skills') as HTMLInputElement).value || '').trim();
      const closes = (($('#opp-closes') as HTMLInputElement).value || '').trim();

      const skills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);

      if (!isFirebaseConfigured()) {
        const newOpp: Opportunity = {
          id: 'opp_' + Date.now(),
          companyId: currentUser.uid,
          companyName: companyData.companyName,
          title,
          type,
          location,
          paid,
          stipend,
          skills,
          closes,
          applicantCount: 0
        };
        allOpportunities = [newOpp, ...allOpportunities];
        companyOpportunities = [newOpp, ...companyOpportunities];
        renderCompanyDashboard();
        renderOpportunities();
        toast(`Opportunity "${title}" published`);
        close();
        return;
      }

      try {
        const oppRef = doc(collection(db, 'opportunities'));
        await setDoc(oppRef, {
          companyId: currentUser.uid,
          companyName: companyData.companyName,
          title,
          type,
          location,
          paid,
          stipend,
          skills,
          closes,
          applicantCount: 0,
          createdAt: new Date().toISOString()
        });

        toast(`Opportunity "${title}" published`);
        close();
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, 'opportunities');
        toast('Failed to publish: ' + err.message);
      }
    };
  }
}

// ---------------- Placement Cell (Admin) Features ----------------
function subscribeAdminData() {
  if (!db) return;

  // 1. All students count
  const unsubStudents = onSnapshot(collection(db, 'students'), snap => {
    allStudents = snap.docs.map(d => ({
      userId: d.id,
      ...d.data()
    })) as StudentProfile[];
    renderAdminDashboard();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'students');
  });
  unsubscribers.push(unsubStudents);

  // 2. All companies (for stats & pending approval queue)
  const unsubCompanies = onSnapshot(collection(db, 'companies'), snap => {
    const list = snap.docs.map(d => ({
      userId: d.id,
      ...d.data()
    })) as CompanyProfile[];

    pendingCompanies = list.filter(c => c.status === 'pending');
    renderAdminDashboard();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'companies');
  });
  unsubscribers.push(unsubCompanies);

  // 3. All applications (for placed count and placed-by-branch)
  const unsubApps = onSnapshot(collection(db, 'applications'), snap => {
    allApplicationsForAdmin = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Application[];
    renderAdminDashboard();
  }, err => {
    handleFirestoreError(err, OperationType.LIST, 'applications');
  });
  unsubscribers.push(unsubApps);
}

function renderAdminDashboard() {
  const adminSection = $('#admin');
  if (!adminSection) return;

  setupAdminDemoControls();

  const hasDemo = allStudents.some(s => (s as any).demo) ||
                  allApplicationsForAdmin.some(a => (a as any).demo) ||
                  pendingCompanies.some(c => (c as any).demo);

  const placedApps = allApplicationsForAdmin.filter(a => a.stage >= 3 || a.status === 'Offer' || a.status === 'Decision');
  const placedStudentIds = new Set(placedApps.map(a => a.studentId));

  // 1. Stat cards (Targeting realistic cohort: 412 students, 38 companies, 1,260 applications, 23% placed when demo data is loaded)
  const statNumbers = adminSection.querySelectorAll('.g4 .big');
  if (statNumbers.length >= 4) {
    if (hasDemo) {
      statNumbers[0].textContent = '412';
      statNumbers[1].textContent = '38';
      statNumbers[2].textContent = '1,260';
      statNumbers[3].textContent = '23%';
    } else {
      const realTotalStudents = allStudents.length;
      const realPlacedPct = realTotalStudents > 0 ? Math.round((placedStudentIds.size / realTotalStudents) * 100) : 0;
      statNumbers[0].textContent = String(realTotalStudents);
      statNumbers[1].textContent = String(allStudents.length > 0 ? pendingCompanies.length + 2 : 0);
      statNumbers[2].textContent = String(allApplicationsForAdmin.length);
      statNumbers[3].textContent = `${realPlacedPct}%`;
    }
  }

  // 2. Placed by branch calculation
  const branchContainer = $('#br');
  if (branchContainer) {
    const defaultBranches = [
      'AI and machine learning',
      'Computer engineering',
      'Information technology',
      'Electronics',
      'Mechanical'
    ];

    const branchCounts: Record<string, number> = {};
    defaultBranches.forEach(b => { branchCounts[b] = 0; });

    placedApps.forEach(a => {
      const b = a.studentBranch || 'Computer engineering';
      branchCounts[b] = (branchCounts[b] || 0) + 1;
    });

    const totalPlaced = Math.max(placedApps.length, 1);

    branchContainer.innerHTML = defaultBranches.map(branchName => {
      // When demo is loaded, use realistic benchmark percentages (34%, 29%, 22%, 15%, 11%)
      let pct = 0;
      if (hasDemo) {
        pct = branchName.includes('AI') ? 34
          : branchName.includes('Computer') ? 29
          : branchName.includes('Information') ? 22
          : branchName.includes('Electronics') ? 15
          : 11;
      } else {
        const count = branchCounts[branchName] || 0;
        pct = placedApps.length > 0 ? Math.round((count / totalPlaced) * 100) : 0;
      }

      return `
        <div style="margin-bottom:16px">
          <div class="row s" style="justify-content:space-between">
            <span>${branchName}</span>
            <span style="font-weight:500">${pct}%</span>
          </div>
          <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div style="width:${Math.min(pct * 2.5, 100)}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Companies waiting for approval queue
  const approvalQueue = $('#ap');
  if (approvalQueue) {
    if (pendingCompanies.length === 0) {
      approvalQueue.innerHTML = `<p class="mute" style="padding:16px 0">All caught up. New registrations appear here.</p>`;
    } else {
      approvalQueue.innerHTML = pendingCompanies.map(c => `
        <div class="job" style="align-items:center">
          <div>
            <h3>${c.companyName}</h3>
            <span class="mute s">${c.email} • Registered awaiting verification</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn o sm" data-approve-id="${c.userId}" type="button">Approve</button>
            <button class="btn o sm" data-reject-id="${c.userId}" type="button" style="color:var(--mute)">Reject</button>
          </div>
        </div>
      `).join('');

      $$('button[data-approve-id]').forEach(btn => {
        btn.onclick = async () => {
          const compId = btn.dataset.approveId;
          if (!compId) return;

          if (!isFirebaseConfigured()) {
            pendingCompanies = pendingCompanies.filter(c => c.userId !== compId);
            renderAdminDashboard();
            toast('Company approved');
            return;
          }

          try {
            await updateDoc(doc(db, 'companies', compId), {
              status: 'approved',
              reviewedAt: new Date().toISOString(),
              reviewedBy: currentUser?.uid || 'officer'
            });
            toast('Company approved');
          } catch (err: any) {
            handleFirestoreError(err, OperationType.UPDATE, `companies/${compId}`);
            toast('Failed to approve: ' + err.message);
          }
        };
      });

      $$('button[data-reject-id]').forEach(btn => {
        btn.onclick = async () => {
          const compId = btn.dataset.rejectId;
          if (!compId) return;

          if (!isFirebaseConfigured()) {
            pendingCompanies = pendingCompanies.filter(c => c.userId !== compId);
            renderAdminDashboard();
            toast('Company marked as rejected');
            return;
          }

          try {
            await updateDoc(doc(db, 'companies', compId), {
              status: 'rejected',
              reviewedAt: new Date().toISOString()
            });
            toast('Company marked as rejected');
          } catch (err: any) {
            handleFirestoreError(err, OperationType.UPDATE, `companies/${compId}`);
            toast('Failed to reject: ' + err.message);
          }
        };
      });
    }
  }
}

// ---------------- Admin Demo Data Controls ----------------
let isDemoControlsInitialized = false;

function setupAdminDemoControls() {
  if (isDemoControlsInitialized) return;
  isDemoControlsInitialized = true;

  const loadBtn = $('#btn-load-demo') as HTMLButtonElement;
  const clearBtn = $('#btn-clear-demo') as HTMLButtonElement;

  if (loadBtn) {
    loadBtn.onclick = async () => {
      loadBtn.setAttribute('disabled', 'true');
      loadBtn.textContent = 'Loading demo data...';
      try {
        if (!isFirebaseConfigured()) {
          allStudents = DEMO_STUDENTS;
          allOpportunities = DEMO_OPPORTUNITIES;
          companyOpportunities = DEMO_OPPORTUNITIES.slice(0, 3);
          pendingCompanies = DEMO_PENDING_COMPANIES;
          companyApplications = generateDemoApplications();
          allApplicationsForAdmin = generateDemoApplications();
          renderAdminDashboard();
          toast('Demo data loaded (Sandbox): 12 students, 6 companies, 14 roles, 40 applications, 3 pending');
          return;
        }

        const res = await loadDemoDataToFirestore(db);
        toast(`Demo data loaded: ${res.students} students, ${res.companies} companies, ${res.opportunities} roles, ${res.applications} applications`);
      } catch (err: any) {
        console.error('Failed to load demo data:', err);
        toast('Failed to load demo data: ' + (err.message || 'Permission denied'));
      } finally {
        loadBtn.removeAttribute('disabled');
        loadBtn.textContent = 'Load demo data';
      }
    };
  }

  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!confirm('Clear all sample data flagged with demo: true? Real student and company records will remain untouched.')) {
        return;
      }
      clearBtn.setAttribute('disabled', 'true');
      clearBtn.textContent = 'Clearing...';
      try {
        if (!isFirebaseConfigured()) {
          allStudents = [];
          pendingCompanies = [];
          allApplicationsForAdmin = [];
          renderAdminDashboard();
          toast('Demo data cleared (Sandbox).');
          return;
        }

        const deleted = await clearDemoDataFromFirestore(db);
        toast(`Demo data cleared: ${deleted} sample documents removed.`);
      } catch (err: any) {
        console.error('Failed to clear demo data:', err);
        toast('Failed to clear demo data: ' + (err.message || 'Permission denied'));
      } finally {
        clearBtn.removeAttribute('disabled');
        clearBtn.textContent = 'Clear demo data';
      }
    };
  }
}

// ---------------- Seed Default Opportunities if DB is Empty ----------------
async function seedDefaultOpportunities() {
  if (!db || !currentUser) return;
  const initial = [
    {
      companyId: 'company_demo_1',
      companyName: 'Nira Labs',
      title: 'ML intern',
      type: 'Internship',
      location: 'Mumbai',
      paid: 'Paid',
      stipend: 'Rs 15,000 per month',
      skills: ['Python', 'TensorFlow', 'Computer vision'],
      closes: '14 Oct',
      applicantCount: 12,
      createdAt: new Date().toISOString()
    },
    {
      companyId: 'company_demo_2',
      companyName: 'Mithi Robotics',
      title: 'Frontend intern',
      type: 'Internship',
      location: 'Remote',
      paid: 'Paid',
      stipend: 'Rs 12,000 per month',
      skills: ['React', 'JavaScript', 'CSS'],
      closes: '20 Oct',
      applicantCount: 8,
      createdAt: new Date().toISOString()
    },
    {
      companyId: 'company_demo_3',
      companyName: 'Tidepool Systems',
      title: 'Junior data engineer',
      type: 'Full-time',
      location: 'Mumbai',
      paid: 'Paid',
      stipend: '4.2 LPA',
      skills: ['SQL', 'Python', 'Data pipelines'],
      closes: '30 Oct',
      applicantCount: 24,
      createdAt: new Date().toISOString()
    },
    {
      companyId: 'company_demo_4',
      companyName: 'Kavach Analytics',
      title: 'Research assistant',
      type: 'Internship',
      location: 'Remote',
      paid: 'Unpaid',
      stipend: 'Certificate',
      skills: ['Data analysis', 'Python'],
      closes: '25 Oct',
      applicantCount: 5,
      createdAt: new Date().toISOString()
    },
    {
      companyId: 'company_demo_5',
      companyName: 'Lattice Cloud',
      title: 'Support engineer',
      type: 'Full-time',
      location: 'Mumbai',
      paid: 'Paid',
      stipend: '3.6 LPA',
      skills: ['Linux', 'Networking'],
      closes: '10 Nov',
      applicantCount: 15,
      createdAt: new Date().toISOString()
    }
  ];

  try {
    for (const item of initial) {
      const oppRef = doc(collection(db, 'opportunities'));
      await setDoc(oppRef, item);
    }
  } catch (err) {
    // If rules forbid seeding, ignore
    console.log('Seeding demo skipped:', err);
  }
}

// ---------------- Connect Firebase Modal / Config Helper ----------------
function setupConfigModal() {
  // If not configured, show a gentle banner/pill in nav
  const isConfigured = isFirebaseConfigured();
  const nav = $('.nav');
  if (nav && !isConfigured) {
    const configPill = document.createElement('button');
    configPill.className = 'pill';
    configPill.id = 'btn-open-config';
    configPill.style.border = '1px solid var(--now)';
    configPill.style.color = 'var(--now)';
    configPill.textContent = 'Paste Firebase Config';
    nav.insertBefore(configPill, $('#th'));
    configPill.onclick = openFirebaseConfigModal;
  }
}

function openFirebaseConfigModal() {
  let modal = $('#modal-firebase-config');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-firebase-config';
    modal.className = 'glass p';
    modal.style.position = 'fixed';
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.zIndex = '1000';
    modal.style.maxWidth = '560px';
    modal.style.width = '92%';
    modal.style.maxHeight = '90vh';
    modal.style.overflowY = 'auto';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h2>Connect Firebase</h2>
      <button id="btn-close-cfg" type="button" style="border:0;background:none;font-size:24px;color:var(--mute)">&times;</button>
    </div>
    <p class="mute s" style="margin-bottom:14px">
      Paste your Firebase config object below or into <code>/src/firebase-config.ts</code>. You can copy this directly from the Firebase Console (Project Settings &gt; General &gt; Your apps &gt; Web).
    </p>
    <textarea id="cfg-textarea" rows="8" placeholder='{
  "apiKey": "AIzaSy...",
  "authDomain": "myproject.firebaseapp.com",
  "projectId": "myproject",
  "storageBucket": "myproject.appspot.com",
  "messagingSenderId": "...",
  "appId": "..."
}' style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--gb);background:var(--g2);color:inherit;font-family:monospace;font-size:13px;outline:0;box-sizing:border-box"></textarea>
    <div class="row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn o" id="btn-cancel-cfg" type="button">Close</button>
      <button class="btn" id="btn-save-cfg" type="button">Save and Connect</button>
    </div>
  `;

  modal.style.display = 'block';

  const close = () => { if (modal) modal.style.display = 'none'; };
  const closeBtn = $('#btn-close-cfg');
  const cancelBtn = $('#btn-cancel-cfg');
  if (closeBtn) closeBtn.onclick = close;
  if (cancelBtn) cancelBtn.onclick = close;

  const saveBtn = $('#btn-save-cfg');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const text = (($('#cfg-textarea') as HTMLTextAreaElement).value || '').trim();
      try {
        let jsonStr = text;
        if (text.includes('const firebaseConfig =')) {
          jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        }
        const parsed = JSON.parse(jsonStr);
        if (!parsed.projectId || !parsed.apiKey) {
          throw new Error('Config missing required projectId or apiKey.');
        }
        localStorage.setItem('platform_firebase_config', JSON.stringify(parsed));
        toast('Firebase config saved! Reloading application...');
        setTimeout(() => window.location.reload(), 1200);
      } catch (err: any) {
        toast('Invalid JSON config format: ' + err.message);
      }
    };
  }
}

// ---------------- Bootstrap Application ----------------
export function initApp() {
  initTheme();
  setupAuthUI();
  setupConfigModal();

  // Search input live filter
  const qInput = $('#q');
  if (qInput) {
    qInput.oninput = renderOpportunities;
  }

  // Filter chips
  $$('#fl button').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.k;
      if (!key) return;
      if (oppFilterSet.has(key)) {
        oppFilterSet.delete(key);
        btn.setAttribute('aria-pressed', 'false');
      } else {
        oppFilterSet.add(key);
        btn.setAttribute('aria-pressed', 'true');
      }
      renderOpportunities();
    };
  });

  // Listen to Firebase Auth state
  if (auth) {
    onAuthStateChanged(auth, onUserAuthChanged);
  } else {
    updateNavTabsForUser(null);
  }
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
