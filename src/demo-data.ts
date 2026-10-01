/**
 * Demo Data Generator & Clearer for Platform Placement Portal
 * Adds realistic sample data with `demo: true` flag straight to Firestore without creating login accounts.
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  type Firestore
} from 'firebase/firestore';

export interface DemoStudent {
  userId: string;
  name: string;
  email: string;
  branch: string;
  skills: string[];
  resumeUrl: string;
  resumeName: string;
  profileCompletePct: number;
  demo: true;
}

export interface DemoCompany {
  userId: string;
  companyName: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  demo: true;
}

export interface DemoOpportunity {
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
  createdAt: string;
  demo: true;
}

export interface DemoApplication {
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
  resumeUrl: string;
  resumeName: string;
  stage: number;
  status: string;
  dates: string[];
  nextStep: string;
  appliedAt: string;
  demo: true;
}

// 12 Students across 5 branches
export const DEMO_STUDENTS: DemoStudent[] = [
  {
    userId: 'demo_student_1',
    name: 'Aarav Patil',
    email: 'aarav.patil@college.edu',
    branch: 'Computer engineering',
    skills: ['Python', 'TensorFlow', 'SQL', 'React', 'Computer vision'],
    resumeUrl: 'https://example.com/resumes/Aarav_Patil.pdf',
    resumeName: 'Resume_Aarav_Patil.pdf',
    profileCompletePct: 92,
    demo: true
  },
  {
    userId: 'demo_student_2',
    name: 'Riya Shah',
    email: 'riya.shah@college.edu',
    branch: 'AI and machine learning',
    skills: ['Python', 'PyTorch', 'Scikit-learn', 'NLP', 'Computer vision'],
    resumeUrl: 'https://example.com/resumes/Riya_Shah.pdf',
    resumeName: 'Resume_Riya_Shah.pdf',
    profileCompletePct: 95,
    demo: true
  },
  {
    userId: 'demo_student_3',
    name: 'Dev Joshi',
    email: 'dev.joshi@college.edu',
    branch: 'AI and machine learning',
    skills: ['Python', 'Deep Learning', 'MLOps', 'OpenCV', 'Docker'],
    resumeUrl: 'https://example.com/resumes/Dev_Joshi.pdf',
    resumeName: 'Resume_Dev_Joshi.pdf',
    profileCompletePct: 88,
    demo: true
  },
  {
    userId: 'demo_student_4',
    name: 'Sana Qureshi',
    email: 'sana.qureshi@college.edu',
    branch: 'Information technology',
    skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS'],
    resumeUrl: 'https://example.com/resumes/Sana_Qureshi.pdf',
    resumeName: 'Resume_Sana_Qureshi.pdf',
    profileCompletePct: 90,
    demo: true
  },
  {
    userId: 'demo_student_5',
    name: 'Karan Mehta',
    email: 'karan.mehta@college.edu',
    branch: 'Information technology',
    skills: ['Python', 'FastAPI', 'Docker', 'Kubernetes', 'MongoDB'],
    resumeUrl: 'https://example.com/resumes/Karan_Mehta.pdf',
    resumeName: 'Resume_Karan_Mehta.pdf',
    profileCompletePct: 84,
    demo: true
  },
  {
    userId: 'demo_student_6',
    name: 'Isha Nair',
    email: 'isha.nair@college.edu',
    branch: 'Computer engineering',
    skills: ['Java', 'Spring Boot', 'Microservices', 'System Design', 'SQL'],
    resumeUrl: 'https://example.com/resumes/Isha_Nair.pdf',
    resumeName: 'Resume_Isha_Nair.pdf',
    profileCompletePct: 96,
    demo: true
  },
  {
    userId: 'demo_student_7',
    name: 'Aditya Sharma',
    email: 'aditya.sharma@college.edu',
    branch: 'Electronics',
    skills: ['Embedded C', 'ARM Cortex', 'IoT', 'PCB Design', 'MATLAB'],
    resumeUrl: 'https://example.com/resumes/Aditya_Sharma.pdf',
    resumeName: 'Resume_Aditya_Sharma.pdf',
    profileCompletePct: 86,
    demo: true
  },
  {
    userId: 'demo_student_8',
    name: 'Ananya Deshmukh',
    email: 'ananya.deshmukh@college.edu',
    branch: 'Electronics',
    skills: ['VLSI', 'Verilog', 'FPGA', 'Digital Electronics', 'C++'],
    resumeUrl: 'https://example.com/resumes/Ananya_Deshmukh.pdf',
    resumeName: 'Resume_Ananya_Deshmukh.pdf',
    profileCompletePct: 88,
    demo: true
  },
  {
    userId: 'demo_student_9',
    name: 'Rohan Kulkarni',
    email: 'rohan.kulkarni@college.edu',
    branch: 'Mechanical',
    skills: ['SolidWorks', 'AutoCAD', 'ANSYS', 'FEA', 'Thermal Analysis'],
    resumeUrl: 'https://example.com/resumes/Rohan_Kulkarni.pdf',
    resumeName: 'Resume_Rohan_Kulkarni.pdf',
    profileCompletePct: 85,
    demo: true
  },
  {
    userId: 'demo_student_10',
    name: 'Tanvi Bhatt',
    email: 'tanvi.bhatt@college.edu',
    branch: 'Mechanical',
    skills: ['Robotics', 'ROS', 'Mechatronics', 'Python', 'MATLAB'],
    resumeUrl: 'https://example.com/resumes/Tanvi_Bhatt.pdf',
    resumeName: 'Resume_Tanvi_Bhatt.pdf',
    profileCompletePct: 90,
    demo: true
  },
  {
    userId: 'demo_student_11',
    name: 'Siddharth Verma',
    email: 'siddharth.verma@college.edu',
    branch: 'Computer engineering',
    skills: ['Go', 'Distributed Systems', 'Linux', 'Redis', 'GraphQL'],
    resumeUrl: 'https://example.com/resumes/Siddharth_Verma.pdf',
    resumeName: 'Resume_Siddharth_Verma.pdf',
    profileCompletePct: 91,
    demo: true
  },
  {
    userId: 'demo_student_12',
    name: 'Pooja Hegde',
    email: 'pooja.hegde@college.edu',
    branch: 'AI and machine learning',
    skills: ['Data Science', 'Statistics', 'Pandas', 'SQL', 'Tableau'],
    resumeUrl: 'https://example.com/resumes/Pooja_Hegde.pdf',
    resumeName: 'Resume_Pooja_Hegde.pdf',
    profileCompletePct: 87,
    demo: true
  }
];

// 6 Approved Companies + 3 Pending Companies
export const DEMO_APPROVED_COMPANIES: DemoCompany[] = [
  {
    userId: 'demo_comp_nira',
    companyName: 'Nira Labs',
    email: 'careers@niralabs.io',
    status: 'approved',
    createdAt: '2026-09-01T10:00:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_mithi',
    companyName: 'Mithi Robotics',
    email: 'campus@mithirobotics.in',
    status: 'approved',
    createdAt: '2026-09-03T11:00:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_kavach',
    companyName: 'Kavach Analytics',
    email: 'talent@kavachanalytics.com',
    status: 'approved',
    createdAt: '2026-09-05T09:30:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_sagar',
    companyName: 'Sagar Vayu Tech',
    email: 'recruit@sagarvayu.in',
    status: 'approved',
    createdAt: '2026-09-08T14:15:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_dhruv',
    companyName: 'Dhruv AI Systems',
    email: 'hello@dhruvai.co',
    status: 'approved',
    createdAt: '2026-09-10T12:00:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_samudra',
    companyName: 'Samudra Dynamics',
    email: 'people@samudradynamics.com',
    status: 'approved',
    createdAt: '2026-09-12T16:00:00Z',
    demo: true
  }
];

export const DEMO_PENDING_COMPANIES: DemoCompany[] = [
  {
    userId: 'demo_comp_lattice',
    companyName: 'Lattice Cloud Solutions',
    email: 'contact@latticecloud.in',
    status: 'pending',
    createdAt: '2026-09-28T09:00:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_orbit',
    companyName: 'Orbit Textiles & Materials',
    email: 'campus@orbittextiles.co.in',
    status: 'pending',
    createdAt: '2026-09-29T14:20:00Z',
    demo: true
  },
  {
    userId: 'demo_comp_kuber',
    companyName: 'Kuber FinTech Labs',
    email: 'talent@kuberfintech.in',
    status: 'pending',
    createdAt: '2026-09-30T11:45:00Z',
    demo: true
  }
];

// 14 Opportunities mixing internships & full-time across Mumbai, Pune & Remote
export const DEMO_OPPORTUNITIES: DemoOpportunity[] = [
  {
    id: 'demo_opp_1',
    companyId: 'demo_comp_nira',
    companyName: 'Nira Labs',
    title: 'ML Intern',
    type: 'Internship',
    location: 'Mumbai',
    paid: 'Paid',
    stipend: 'Rs 18,000 / month',
    skills: ['Python', 'TensorFlow', 'Computer vision'],
    closes: '14 Oct',
    applicantCount: 5,
    createdAt: '2026-09-10T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_2',
    companyId: 'demo_comp_nira',
    companyName: 'Nira Labs',
    title: 'Computer Vision Engineer',
    type: 'Full-time',
    location: 'Mumbai',
    paid: 'Paid',
    stipend: '6.5 LPA',
    skills: ['Python', 'OpenCV', 'Deep Learning'],
    closes: '28 Oct',
    applicantCount: 3,
    createdAt: '2026-09-12T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_3',
    companyId: 'demo_comp_mithi',
    companyName: 'Mithi Robotics',
    title: 'Robotics Systems Intern',
    type: 'Internship',
    location: 'Pune',
    paid: 'Paid',
    stipend: 'Rs 16,000 / month',
    skills: ['ROS', 'C++', 'Python', 'Robotics'],
    closes: '20 Oct',
    applicantCount: 4,
    createdAt: '2026-09-14T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_4',
    companyId: 'demo_comp_mithi',
    companyName: 'Mithi Robotics',
    title: 'Frontend Engineer Intern',
    type: 'Internship',
    location: 'Remote',
    paid: 'Paid',
    stipend: 'Rs 15,000 / month',
    skills: ['React', 'TypeScript', 'Tailwind'],
    closes: '25 Oct',
    applicantCount: 4,
    createdAt: '2026-09-15T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_5',
    companyId: 'demo_comp_kavach',
    companyName: 'Kavach Analytics',
    title: 'Cybersecurity Analyst',
    type: 'Full-time',
    location: 'Mumbai',
    paid: 'Paid',
    stipend: '5.8 LPA',
    skills: ['Linux', 'Networking', 'Python', 'Security'],
    closes: '30 Oct',
    applicantCount: 2,
    createdAt: '2026-09-16T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_6',
    companyId: 'demo_comp_kavach',
    companyName: 'Kavach Analytics',
    title: 'Data Analytics Intern',
    type: 'Internship',
    location: 'Remote',
    paid: 'Unpaid',
    stipend: 'Certificate & LOR',
    skills: ['Python', 'SQL', 'Pandas', 'Tableau'],
    closes: '18 Oct',
    applicantCount: 3,
    createdAt: '2026-09-17T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_7',
    companyId: 'demo_comp_sagar',
    companyName: 'Sagar Vayu Tech',
    title: 'Cloud Infrastructure Engineer',
    type: 'Full-time',
    location: 'Pune',
    paid: 'Paid',
    stipend: '7.2 LPA',
    skills: ['AWS', 'Docker', 'Kubernetes', 'Linux'],
    closes: '05 Nov',
    applicantCount: 3,
    createdAt: '2026-09-18T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_8',
    companyId: 'demo_comp_sagar',
    companyName: 'Sagar Vayu Tech',
    title: 'Embedded Firmware Intern',
    type: 'Internship',
    location: 'Pune',
    paid: 'Paid',
    stipend: 'Rs 14,000 / month',
    skills: ['Embedded C', 'ARM Cortex', 'IoT'],
    closes: '22 Oct',
    applicantCount: 2,
    createdAt: '2026-09-19T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_9',
    companyId: 'demo_comp_dhruv',
    companyName: 'Dhruv AI Systems',
    title: 'Applied AI Researcher',
    type: 'Full-time',
    location: 'Mumbai',
    paid: 'Paid',
    stipend: '8.4 LPA',
    skills: ['Python', 'PyTorch', 'NLP', 'MLOps'],
    closes: '12 Nov',
    applicantCount: 3,
    createdAt: '2026-09-20T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_10',
    companyId: 'demo_comp_dhruv',
    companyName: 'Dhruv AI Systems',
    title: 'Backend Engineering Intern',
    type: 'Internship',
    location: 'Remote',
    paid: 'Paid',
    stipend: 'Rs 20,000 / month',
    skills: ['Go', 'Distributed Systems', 'SQL'],
    closes: '31 Oct',
    applicantCount: 2,
    createdAt: '2026-09-21T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_11',
    companyId: 'demo_comp_samudra',
    companyName: 'Samudra Dynamics',
    title: 'Mechanical Design Engineer',
    type: 'Full-time',
    location: 'Mumbai',
    paid: 'Paid',
    stipend: '5.5 LPA',
    skills: ['SolidWorks', 'ANSYS', 'FEA'],
    closes: '15 Nov',
    applicantCount: 2,
    createdAt: '2026-09-22T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_12',
    companyId: 'demo_comp_samudra',
    companyName: 'Samudra Dynamics',
    title: 'Marine Robotics Intern',
    type: 'Internship',
    location: 'Pune',
    paid: 'Unpaid',
    stipend: 'Stipend upon review',
    skills: ['CAD', 'Robotics', 'MATLAB'],
    closes: '24 Oct',
    applicantCount: 1,
    createdAt: '2026-09-23T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_13',
    companyId: 'demo_comp_kavach',
    companyName: 'Kavach Analytics',
    title: 'Fullstack Web Intern',
    type: 'Internship',
    location: 'Mumbai',
    paid: 'Paid',
    stipend: 'Rs 12,000 / month',
    skills: ['React', 'Node.js', 'PostgreSQL'],
    closes: '02 Nov',
    applicantCount: 3,
    createdAt: '2026-09-24T10:00:00Z',
    demo: true
  },
  {
    id: 'demo_opp_14',
    companyId: 'demo_comp_sagar',
    companyName: 'Sagar Vayu Tech',
    title: 'Hardware Testing Associate',
    type: 'Full-time',
    location: 'Remote',
    paid: 'Paid',
    stipend: '4.5 LPA',
    skills: ['PCB Design', 'VLSI', 'MATLAB'],
    closes: '08 Nov',
    applicantCount: 2,
    createdAt: '2026-09-25T10:00:00Z',
    demo: true
  }
];

// Generate 40 Applications spread across the 5 stages
// Stage 0: Applied (12)
// Stage 1: Shortlisted (10)
// Stage 2: Interview (8)
// Stage 3: Offer (6)
// Stage 4: Decision (4)
export function generateDemoApplications(): DemoApplication[] {
  const STAGE_CONFIG = [
    { stage: 0, status: 'Applied', count: 12, nextStep: 'Application received. Companies usually reply within 7 days.' },
    { stage: 1, status: 'Shortlisted', count: 10, nextStep: 'Candidate shortlisted. The recruitment panel will contact for technical screening.' },
    { stage: 2, status: 'Interview', count: 8, nextStep: 'Technical round scheduled on 5 Oct, 11:30 AM via Google Meet.' },
    { stage: 3, status: 'Offer', count: 6, nextStep: 'Formal offer letter extended. Awaiting student acceptance.' },
    { stage: 4, status: 'Decision', count: 4, nextStep: 'Offer accepted. Onboarding documentation in progress.' }
  ];

  const apps: DemoApplication[] = [];
  let appIdx = 1;

  STAGE_CONFIG.forEach(cfg => {
    for (let i = 0; i < cfg.count; i++) {
      const student = DEMO_STUDENTS[(appIdx + i) % DEMO_STUDENTS.length];
      const opp = DEMO_OPPORTUNITIES[(appIdx * 2 + i) % DEMO_OPPORTUNITIES.length];

      // Build dates array up to current stage
      const dates = ['', '', '', '', ''];
      const dateList = ['10 Sep', '18 Sep', '27 Sep', '02 Oct', '05 Oct'];
      for (let s = 0; s <= cfg.stage; s++) {
        dates[s] = dateList[s] || '01 Oct';
      }

      apps.push({
        id: `demo_app_${appIdx}`,
        opportunityId: opp.id,
        opportunityTitle: opp.title,
        companyId: opp.companyId,
        companyName: opp.companyName,
        studentId: student.userId,
        studentName: student.name,
        studentEmail: student.email,
        studentBranch: student.branch,
        studentSkills: student.skills,
        resumeUrl: student.resumeUrl,
        resumeName: student.resumeName,
        stage: cfg.stage,
        status: cfg.status,
        dates,
        nextStep: cfg.nextStep,
        appliedAt: '2026-09-10T12:00:00Z',
        demo: true
      });

      appIdx++;
    }
  });

  return apps;
}

/**
 * Write realistic sample data straight to Firestore with demo: true flag
 */
export async function loadDemoDataToFirestore(db: Firestore): Promise<{
  students: number;
  companies: number;
  opportunities: number;
  applications: number;
}> {
  // 1. Students
  for (const s of DEMO_STUDENTS) {
    await setDoc(doc(db, 'students', s.userId), s);
  }

  // 2. Approved Companies
  for (const c of DEMO_APPROVED_COMPANIES) {
    await setDoc(doc(db, 'companies', c.userId), c);
  }

  // 3. Pending Companies
  for (const c of DEMO_PENDING_COMPANIES) {
    await setDoc(doc(db, 'companies', c.userId), c);
  }

  // 4. Opportunities
  for (const o of DEMO_OPPORTUNITIES) {
    await setDoc(doc(db, 'opportunities', o.id), o);
  }

  // 5. Applications (40 total)
  const demoApps = generateDemoApplications();
  for (const a of demoApps) {
    await setDoc(doc(db, 'applications', a.id), a);
  }

  return {
    students: DEMO_STUDENTS.length,
    companies: DEMO_APPROVED_COMPANIES.length + DEMO_PENDING_COMPANIES.length,
    opportunities: DEMO_OPPORTUNITIES.length,
    applications: demoApps.length
  };
}

/**
 * Clear only documents flagged with `demo: true`
 */
export async function clearDemoDataFromFirestore(db: Firestore): Promise<number> {
  let deletedCount = 0;
  const collectionsToClean = ['students', 'companies', 'opportunities', 'applications'];

  for (const colName of collectionsToClean) {
    const q = query(collection(db, colName), where('demo', '==', true));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
      deletedCount++;
    }
  }

  return deletedCount;
}
