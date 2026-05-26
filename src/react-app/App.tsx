import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronRight,
  Shield,
  Copy,
  Check,
  Menu,
  Sun,
  Moon,
} from "lucide-react";
import "./index.css";

interface Field {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface FlowStep {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  label: string;
  description: string;
}

interface FlowLane {
  title: string;
  color: string;
  icon: string;
  steps: FlowStep[];
}

interface Endpoint {
  id: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "FLOW";
  path: string;
  auth: boolean;
  description: string;
  category: string;
  payload?: Record<string, unknown>;
  payloadFields?: Field[];
  response?: Record<string, unknown> | Record<string, unknown>[];
  responseFields?: Field[];
  flow?: FlowLane[];
}

const API_BASE = window.location.origin;

const endpoints: Endpoint[] = [
  {
    id: "health",
    method: "GET",
    path: "/api/",
    auth: false,
    description: "Verify the system availability and operational health.",
    category: "System",
    response: { name: "LEC App Backend", status: "ok" },
    responseFields: [
      { name: "name", type: "string", required: true, description: "Name of the service." },
      { name: "status", type: "string", required: true, description: "Operational status (e.g., 'ok')." },
      { name: "timestamp", type: "string", required: true, description: "ISO timestamp of the response." }
    ]
  },
  {
    id: "signin",
    method: "POST",
    path: "/api/auth/signin",
    auth: false,
    description: "Securely authenticate users and receive an access token.",
    category: "Authentication",
    payload: { email: "user@example.com", password: "password123" },
    payloadFields: [
      { name: "email", type: "string", required: true, description: "User's registered email address." },
      { name: "password", type: "string", required: true, description: "User's account password." }
    ],
    response: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "user@example.com",
        firstName: "Jane",
        lastName: "Doe",
        role: "student",
        createdAt: "2024-05-14T10:00:00Z"
      }
    },
    responseFields: [
      { name: "token", type: "string", required: true, description: "JWT access token for subsequent requests." },
      { name: "user", type: "object", required: true, description: "Sanitized user profile object." }
    ]
  },
  {
    id: "signup",
    method: "POST",
    path: "/api/auth/signup",
    auth: false,
    description: "Register new student or leadership accounts for the platform.",
    category: "Authentication",
    payload: {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      password: "secure_pass_123",
      confirmPassword: "secure_pass_123",
      megaCenterId: "550e8400-e29b-41d4-a716-446655440001",
      userLocation: "Lagos, Nigeria"
    },
    payloadFields: [
      { name: "firstName", type: "string", required: true, description: "User's legal first name." },
      { name: "lastName", type: "string", required: true, description: "User's legal last name." },
      { name: "email", type: "string", required: true, description: "Unique email for the account." },
      { name: "password", type: "string", required: true, description: "Must be at least 6 characters." },
      { name: "confirmPassword", type: "string", required: true, description: "Must match the password field." },
      { name: "megaCenterId", type: "uuid", required: false, description: "Optional ID of the church mega center." },
      { name: "userLocation", type: "string", required: false, description: "Optional physical location of the user." }
    ]
  },
  {
    id: "forgot-password",
    method: "POST",
    path: "/api/auth/forgot-password",
    auth: false,
    description: "Request a password reset code to be sent to the user's email.",
    category: "Authentication",
    payload: { email: "user@example.com" },
    response: { message: "If an account exists, a reset code has been sent" }
  },
  {
    id: "verify-reset-code",
    method: "POST",
    path: "/api/auth/verify-reset-code",
    auth: false,
    description: "Validate a 6-digit reset code received via email.",
    category: "Authentication",
    payload: { email: "user@example.com", code: "123456" },
    response: { valid: true }
  },
  {
    id: "reset-password",
    method: "POST",
    path: "/api/auth/reset-password",
    auth: false,
    description: "Reset the user's password using a valid reset code.",
    category: "Authentication",
    payload: { email: "user@example.com", code: "123456", newPassword: "new_secure_pass" },
    response: { message: "Password has been reset successfully" }
  },
  {
    id: "courses-list",
    method: "GET",
    path: "/api/courses",
    auth: false,
    description: "Retrieve the full library of available courses and modules.",
    category: "Courses",
    response: [
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        title: "Theology 101",
        description: "Introduction to basic theological concepts.",
        imageUrl: "https://example.com/image.jpg",
        createdAt: "2024-05-14T10:00:00Z",
        sections: [
          {
            id: "550e8400-e29b-41d4-a716-446655440003",
            title: "Divine Revelation",
            videoUrl: "https://vimeo.com/...",
            sortOrder: 1
          }
        ]
      }
    ],
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Unique identifier for the course." },
      { name: "title", type: "string", required: true, description: "Display title of the course." },
      { name: "description", type: "string", required: false, description: "Detailed course summary." },
      { name: "imageUrl", type: "url", required: false, description: "Link to the course thumbnail." },
      { name: "sections", type: "array", required: true, description: "List of lesson sections belonging to this course." }
    ]
  },
  {
    id: "course-detail",
    method: "GET",
    path: "/api/courses/:courseId",
    auth: false,
    description: "Retrieve detailed information for a specific course including all sections.",
    category: "Courses",
    response: {
      id: "550e8400-e29b-41d4-a716-446655440002",
      title: "Theology 101",
      sections: [
        {
          id: "uuid",
          title: "Introduction",
          videoUrl: "url",
          sortOrder: 1
        }
      ]
    },
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Course ID." },
      { name: "title", type: "string", required: true, description: "Course Title." },
      { name: "sections", type: "array", required: true, description: "Array of section objects sorted by order." }
    ]
  },
  {
    id: "enroll",
    method: "POST",
    path: "/api/courses/:courseId/enroll",
    auth: true,
    description: "Establish a new enrollment record and initialize course progress.",
    category: "Learning",
    response: {
      id: "uuid",
      userId: "uuid",
      courseId: "uuid",
      createdAt: "2024-05-14T10:00:00Z"
    },
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Enrollment record ID." },
      { name: "userId", type: "uuid", required: true, description: "ID of the student." },
      { name: "courseId", type: "uuid", required: true, description: "ID of the enrolled course." },
      { name: "createdAt", type: "timestamp", required: true, description: "Time of enrollment." }
    ]
  },
  {
    id: "progress",
    method: "GET",
    path: "/api/courses/:courseId/progress",
    auth: true,
    description: "Track completion status across course modules for the active user.",
    category: "Learning",
    response: {
      sections: [
        { sectionId: "uuid", completed: true },
        { sectionId: "uuid", completed: false }
      ]
    },
    responseFields: [
      { name: "sections", type: "array", required: true, description: "List of progress states for each course section." },
      { name: "sections.sectionId", type: "uuid", required: true, description: "ID of the specific section." },
      { name: "sections.completed", type: "boolean", required: true, description: "Whether the user has finished this section." }
    ]
  },
  {
    id: "complete-section",
    method: "PATCH",
    path: "/api/sections/:sectionId/complete",
    auth: true,
    description: "Mark a specific section as completed and sync with progress tracking.",
    category: "Learning",
    response: { message: "Section marked as completed", sectionId: "uuid" },
    responseFields: [
      { name: "message", type: "string", required: true, description: "Confirmation message." },
      { name: "sectionId", type: "uuid", required: true, description: "The ID of the updated section." }
    ]
  },
  {
    id: "mega-centers",
    method: "GET",
    path: "/api/mega-centers",
    auth: false,
    description: "Fetch a list of church mega centers for registration reference.",
    category: "System",
    response: [
      {
        id: "uuid",
        name: "Lagos Mega Center",
        church: "Christ Embassy",
        zonalPastor: "Pastor Joy",
        head: "Deacon John",
        email: "lagos@example.com",
        phone: "+234..."
      }
    ],
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Center unique identifier." },
      { name: "name", type: "string", required: true, description: "Full name of the mega center." },
      { name: "church", type: "string", required: false, description: "Associated church name." },
      { name: "zonalPastor", type: "string", required: false, description: "Presiding zonal pastor." }
    ]
  },

  // --- Exams ---

  {
    id: "exam-overview",
    method: "FLOW",
    path: "/api/exams",
    auth: false,
    description: "Overview of the complete exam flow — from creation to scoring.",
    category: "Exams",
    flow: [
      {
        title: "Admin Flow",
        color: "from-blue-600/20 to-blue-500/5",
        icon: "🛠",
        steps: [
          { method: "POST", path: "/api/exams/import", label: "Bulk import exam", description: "Create exam + all questions in one request" },
          { method: "PATCH", path: "/api/exams/:id/publish", label: "Publish exam", description: "Make exam visible to users" },
          { method: "GET", path: "/api/exams", label: "Manage exams", description: "List, edit, delete exams and questions" },
        ]
      },
      {
        title: "User Flow",
        color: "from-emerald-600/20 to-emerald-500/5",
        icon: "👤",
        steps: [
          { method: "GET", path: "/api/exams/published", label: "Browse exams", description: "View all published exams" },
          { method: "POST", path: "/api/exams/:id/enroll", label: "Enroll", description: "Register for the exam" },
          { method: "GET", path: "/api/exams/:id/take", label: "Take exam", description: "Fetch questions (answers hidden)" },
          { method: "POST", path: "/api/exams/:id/submit", label: "Submit answers", description: "Send answers, receive score + results" },
          { method: "GET", path: "/api/exams/:id/attempts", label: "Review history", description: "View past attempts and scores" },
        ]
      }
    ]
  },
  {
    id: "exam-create",
    method: "POST",
    path: "/api/exams",
    auth: true,
    description: "Create a new exam. Requires admin role.",
    category: "Exams",
    payload: { title: "Born Again Quiz", description: "Test your understanding", passingScore: 60, timeLimitMinutes: 30 },
    payloadFields: [
      { name: "title", type: "string", required: true, description: "Display title of the exam." },
      { name: "description", type: "string", required: false, description: "Optional description of the exam." },
      { name: "passingScore", type: "number", required: false, description: "Percentage required to pass (default: 50)." },
      { name: "timeLimitMinutes", type: "number", required: false, description: "Optional time limit in minutes." }
    ],
    response: { id: "uuid", title: "Born Again Quiz", passingScore: 60, isPublished: false, createdAt: "2026-05-26T00:00:00Z" },
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Unique exam identifier." },
      { name: "title", type: "string", required: true, description: "Exam title." },
      { name: "passingScore", type: "number", required: true, description: "Passing score percentage." },
      { name: "isPublished", type: "boolean", required: true, description: "Whether the exam is visible to users." }
    ]
  },
  {
    id: "exam-import",
    method: "POST",
    path: "/api/exams/import",
    auth: true,
    description: "Bulk import an exam with all questions in a single request. Requires admin role.",
    category: "Exams",
    payload: {
      exam: { title: "Born Again Quiz", description: "Test your understanding", passingScore: 60 },
      questions: [
        { questionText: "To be born again is:", options: ["from womb", "from above", "from heaven", "stop bad things"], correctIndices: [1, 2], scripture: null, sortOrder: 0 }
      ]
    },
    payloadFields: [
      { name: "exam", type: "object", required: true, description: "Exam metadata (title, description, passingScore, timeLimitMinutes)." },
      { name: "questions", type: "array", required: true, description: "Array of question objects (min 1)." },
      { name: "questions.questionText", type: "string", required: true, description: "The question text." },
      { name: "questions.options", type: "string[]", required: true, description: "Array of answer choices (min 2)." },
      { name: "questions.correctIndices", type: "number[]", required: true, description: "Indices of correct options (supports multiple)." },
      { name: "questions.scripture", type: "string", required: false, description: "Optional scripture reference." },
      { name: "questions.sortOrder", type: "number", required: true, description: "Display order of the question." }
    ],
    response: { exam: { id: "uuid", title: "Born Again Quiz" }, questions: [{ id: "uuid", questionText: "..." }] },
    responseFields: [
      { name: "exam", type: "object", required: true, description: "The created exam object." },
      { name: "questions", type: "array", required: true, description: "Array of created question objects." }
    ]
  },
  {
    id: "exam-list",
    method: "GET",
    path: "/api/exams",
    auth: true,
    description: "List all exams with their questions. Requires admin role.",
    category: "Exams",
    response: [
      {
        id: "uuid",
        title: "Born Again Quiz",
        description: "Test your understanding",
        passingScore: 60,
        isPublished: true,
        createdAt: "2026-05-26T00:00:00Z",
        questions: [
          { id: "uuid", questionText: "To be born again is:", options: ["from womb", "from above", "from heaven", "stop bad things"], correctIndices: [1, 2], scripture: null, sortOrder: 0 }
        ]
      }
    ],
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Exam ID." },
      { name: "title", type: "string", required: true, description: "Exam title." },
      { name: "questions", type: "array", required: true, description: "Array of questions with correct answers." }
    ]
  },
  {
    id: "exam-detail",
    method: "GET",
    path: "/api/exams/:id",
    auth: true,
    description: "Retrieve a single exam with all its questions and answers. Requires admin role.",
    category: "Exams",
    response: { id: "uuid", title: "Born Again Quiz", questions: [{ id: "uuid", questionText: "...", correctIndices: [1, 2] }] },
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Exam ID." },
      { name: "title", type: "string", required: true, description: "Exam title." },
      { name: "questions", type: "array", required: true, description: "Questions with correct answers visible." }
    ]
  },
  {
    id: "exam-update",
    method: "PUT",
    path: "/api/exams/:id",
    auth: true,
    description: "Update exam metadata. Requires admin role.",
    category: "Exams",
    payload: { title: "Updated Title", passingScore: 70 },
    payloadFields: [
      { name: "title", type: "string", required: false, description: "New exam title." },
      { name: "description", type: "string", required: false, description: "New description." },
      { name: "passingScore", type: "number", required: false, description: "New passing score." },
      { name: "timeLimitMinutes", type: "number", required: false, description: "New time limit." }
    ],
    response: { id: "uuid", title: "Updated Title", passingScore: 70, isPublished: false }
  },
  {
    id: "exam-delete",
    method: "DELETE",
    path: "/api/exams/:id",
    auth: true,
    description: "Delete an exam and all its questions (cascade). Requires admin role.",
    category: "Exams",
    response: { message: "Exam deleted" }
  },
  {
    id: "exam-publish",
    method: "PATCH",
    path: "/api/exams/:id/publish",
    auth: true,
    description: "Toggle the published status of an exam. Requires admin role.",
    category: "Exams",
    response: { id: "uuid", title: "Born Again Quiz", isPublished: true }
  },
  {
    id: "exam-add-question",
    method: "POST",
    path: "/api/exams/:examId/questions",
    auth: true,
    description: "Add a question to an exam. Requires admin role.",
    category: "Exams",
    payload: { questionText: "To be born again is:", options: ["from womb", "from above", "from heaven", "stop bad things"], correctIndices: [1, 2], scripture: null, sortOrder: 0 },
    payloadFields: [
      { name: "questionText", type: "string", required: true, description: "The question text." },
      { name: "options", type: "string[]", required: true, description: "Answer choices (min 2)." },
      { name: "correctIndices", type: "number[]", required: true, description: "Indices of correct options." },
      { name: "scripture", type: "string", required: false, description: "Scripture reference." },
      { name: "sortOrder", type: "number", required: true, description: "Display order." }
    ],
    response: { id: "uuid", examId: "uuid", questionText: "To be born again is:", correctIndices: [1, 2] }
  },
  {
    id: "exam-update-question",
    method: "PUT",
    path: "/api/exams/:examId/questions/:qId",
    auth: true,
    description: "Update a question. Requires admin role.",
    category: "Exams",
    payload: { questionText: "Updated question", correctIndices: [0] },
    payloadFields: [
      { name: "questionText", type: "string", required: false, description: "Updated question text." },
      { name: "options", type: "string[]", required: false, description: "Updated options." },
      { name: "correctIndices", type: "number[]", required: false, description: "Updated correct indices." },
      { name: "scripture", type: "string", required: false, description: "Updated scripture." },
      { name: "sortOrder", type: "number", required: false, description: "Updated sort order." }
    ],
    response: { id: "uuid", questionText: "Updated question", correctIndices: [0] }
  },
  {
    id: "exam-delete-question",
    method: "DELETE",
    path: "/api/exams/:examId/questions/:qId",
    auth: true,
    description: "Delete a question from an exam. Requires admin role.",
    category: "Exams",
    response: { message: "Question deleted" }
  },
  {
    id: "exam-published",
    method: "GET",
    path: "/api/exams/published",
    auth: true,
    description: "List all published exams available for enrollment. No admin role required.",
    category: "Exams",
    response: [{ id: "uuid", title: "Born Again Quiz", description: "Test your understanding", passingScore: 60, isPublished: true, createdAt: "2026-05-26T00:00:00Z" }],
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Exam ID." },
      { name: "title", type: "string", required: true, description: "Exam title." },
      { name: "description", type: "string", required: false, description: "Exam description." },
      { name: "passingScore", type: "number", required: true, description: "Score needed to pass." },
      { name: "timeLimitMinutes", type: "number", required: false, description: "Optional time limit." }
    ]
  },
  {
    id: "exam-enroll",
    method: "POST",
    path: "/api/exams/:id/enroll",
    auth: true,
    description: "Enroll the authenticated user in a published exam.",
    category: "Exams",
    response: { id: "uuid", userId: "uuid", examId: "uuid", createdAt: "2026-05-26T00:00:00Z" },
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Enrollment record ID." },
      { name: "userId", type: "uuid", required: true, description: "ID of the enrolled user." },
      { name: "examId", type: "uuid", required: true, description: "ID of the exam." },
      { name: "createdAt", type: "timestamp", required: true, description: "Enrollment timestamp." }
    ]
  },
  {
    id: "exam-take",
    method: "GET",
    path: "/api/exams/:id/take",
    auth: true,
    description: "Retrieve exam questions without answers. User must be enrolled.",
    category: "Exams",
    response: {
      exam: { id: "uuid", title: "Born Again Quiz", description: "Test your understanding", timeLimitMinutes: 30, passingScore: 60 },
      questions: [
        { id: "uuid", questionText: "To be born again is:", options: ["from womb", "from above", "from heaven", "stop bad things"], scripture: null, sortOrder: 0 }
      ]
    },
    responseFields: [
      { name: "exam", type: "object", required: true, description: "Exam metadata (no questions here)." },
      { name: "questions", type: "array", required: true, description: "Questions without correctIndices." },
      { name: "questions.id", type: "uuid", required: true, description: "Question ID used when submitting answers." },
      { name: "questions.questionText", type: "string", required: true, description: "The question." },
      { name: "questions.options", type: "string[]", required: true, description: "Answer choices." }
    ]
  },
  {
    id: "exam-submit",
    method: "POST",
    path: "/api/exams/:id/submit",
    auth: true,
    description: "Submit exam answers and receive score with per-question results. User must be enrolled.",
    category: "Exams",
    payload: { answers: { "question-uuid-1": [1, 2], "question-uuid-2": [0] } },
    payloadFields: [
      { name: "answers", type: "object", required: true, description: "Map of questionId → selectedIndices (array of numbers)." }
    ],
    response: { attemptId: "uuid", score: 80, passed: true, totalQuestions: 10, correctCount: 8, results: [{ questionId: "uuid", correct: true }, { questionId: "uuid", correct: false }] },
    responseFields: [
      { name: "attemptId", type: "uuid", required: true, description: "Unique attempt identifier." },
      { name: "score", type: "number", required: true, description: "Score as percentage (0–100)." },
      { name: "passed", type: "boolean", required: true, description: "Whether score >= passingScore." },
      { name: "totalQuestions", type: "number", required: true, description: "Total number of questions." },
      { name: "correctCount", type: "number", required: true, description: "Number of correctly answered questions." },
      { name: "results", type: "array", required: true, description: "Per-question result (correct: true/false)." }
    ]
  },
  {
    id: "exam-attempts",
    method: "GET",
    path: "/api/exams/:id/attempts",
    auth: true,
    description: "Retrieve the authenticated user's attempt history for a specific exam.",
    category: "Exams",
    response: [{ id: "uuid", examId: "uuid", score: 80, passed: true, answers: {}, completedAt: "2026-05-26T00:00:00Z" }],
    responseFields: [
      { name: "id", type: "uuid", required: true, description: "Attempt ID." },
      { name: "score", type: "number", required: true, description: "Score percentage." },
      { name: "passed", type: "boolean", required: true, description: "Whether the user passed." },
      { name: "completedAt", type: "timestamp", required: true, description: "When the attempt was submitted." }
    ]
  }
];

const categories = Array.from(new Set(endpoints.map(e => e.category)));

function FlowChart({ lanes }: { lanes: FlowLane[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {lanes.map((lane, li) => (
        <div key={li} className="next-card bg-surface shadow-lg border-border/50 overflow-hidden">
          <div className={`px-6 py-4 bg-gradient-to-r ${lane.color} border-b border-border/50 flex items-center gap-3`}>
            <span className="text-xl">{lane.icon}</span>
            <div>
              <h3 className="font-bold text-foreground">{lane.title}</h3>
              <p className="text-xs text-muted/70">{lane.steps.length} steps</p>
            </div>
          </div>
          <div className="p-6">
            <div className="relative">
              {lane.steps.map((step, si) => (
                <div key={si} className="relative flex gap-5 pb-8 last:pb-0">
                  {/* Connector line */}
                  {si < lane.steps.length - 1 && (
                    <div className="absolute left-[17px] top-10 bottom-0 w-px bg-border" />
                  )}

                  {/* Step dot */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black border-2 ${
                      step.method === "GET" ? "border-get text-get bg-get/10" :
                      step.method === "POST" ? "border-post text-post bg-post/10" :
                      step.method === "PATCH" ? "border-patch text-patch bg-patch/10" :
                      "border-delete text-delete bg-delete/10"
                    }`}>
                      {step.method === "GET" && "G"}
                      {step.method === "POST" && "P"}
                      {step.method === "PATCH" && "A"}
                      {step.method === "DELETE" && "D"}
                      {step.method === "PUT" && "U"}
                    </div>
                    {/* Step number */}
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-[8px] font-black text-white flex items-center justify-center shadow-md">
                      {si + 1}
                    </div>
                  </div>

                  {/* Step content */}
                  <div className="flex-1 min-w-0 space-y-1.5 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border tracking-wide ${
                        step.method === "GET" ? "text-get border-get/20 bg-get/5" :
                        step.method === "POST" ? "text-post border-post/20 bg-post/5" :
                        step.method === "PATCH" ? "text-patch border-patch/20 bg-patch/5" :
                        "text-delete border-delete/20 bg-delete/5"
                      }`}>
                        {step.method}
                      </span>
                      <code className="text-xs font-mono text-accent font-semibold">
                        {step.path}
                      </code>
                    </div>
                    <p className="text-sm font-bold text-foreground">{step.label}</p>
                    <p className="text-xs text-muted leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
  function App() {  const [activeId, setActiveId] = useState(endpoints[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const activeEndpoint = endpoints.find(e => e.id === activeId) || endpoints[0];

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "text-get border-get/20 bg-get/5";
      case "POST": return "text-post border-post/20 bg-post/5";
      case "PATCH": return "text-patch border-patch/20 bg-patch/5";
      case "DELETE": return "text-delete border-delete/20 bg-delete/5";
      case "FLOW": return "text-accent border-accent/20 bg-accent/5";
      default: return "text-muted border-border bg-surface";
    }
  };

  const getMethodDot = (method: string) => {
    switch (method) {
      case "GET": return "bg-get";
      case "POST": return "bg-post";
      case "PATCH": return "bg-patch";
      case "DELETE": return "bg-delete";
      case "FLOW": return "bg-accent";
      default: return "bg-muted";
    }
  };

  const filteredEndpoints = useMemo(() => {
    if (!searchQuery) return endpoints;
    return endpoints.filter(e =>
      e.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderJSON = (obj: unknown) => {
    const json = JSON.stringify(obj, null, 2);
    return json.split('\n').map((line, i) => {
      const parts = line.split(/("(?:[^"\\]|\\.)*")/);
      return (
        <div key={i} className="flex">
          {parts.map((part, j) => {
            if (part.startsWith('"') && part.endsWith('"')) {
              const nextPart = parts[j + 1];
              const isKey = nextPart && nextPart.trim().startsWith(':');
              return (
                <span key={j} className={isKey ? "text-json-key font-semibold" : "text-json-string"}>
                  {part}
                </span>
              );
            }
            return <span key={j} className="text-code-text">{part}</span>;
          })}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-accent/30 antialiased transition-colors duration-300">
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-6">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 hover:bg-surface-hover rounded-md transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform border border-border">
                <img src="/LE_Logo.png" alt="Love Economy Logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-base sm:text-lg tracking-tight hidden xs:inline-block">LE Training Docs</span>
            </div>
          </div>

          <div className="flex-1 max-w-md relative group hidden md:block">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-muted group-focus-within:text-accent transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Search documentation..."
              className="w-full bg-sidebar border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-muted/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-[10px] font-bold tracking-wider uppercase shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="hidden sm:inline text-foreground/80">API Docs</span>
            </div>

            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-muted hover:text-foreground transition-all duration-200 shadow-sm flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex max-w-[1400px] mx-auto w-full relative">
        <aside
          className={`
            fixed lg:sticky top-16 left-0 h-[calc(100vh-64px)] w-72 border-r border-border bg-sidebar z-40 transition-transform lg:translate-x-0
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="h-full overflow-y-auto py-8 px-4 space-y-8 scroll-smooth">
            <div className="space-y-4">
              <h4 className="px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">Introduction</h4>
              <nav className="space-y-1">
                <button className="sidebar-link w-full text-left">Overview</button>
                <button className="sidebar-link w-full text-left">Getting Started</button>
              </nav>
            </div>

            {categories.map(category => {
              const categoryEndpoints = filteredEndpoints.filter(e => e.category === category);
              if (categoryEndpoints.length === 0) return null;

              return (
                <div key={category} className="space-y-4">
                  <h4 className="px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">{category}</h4>
                  <nav className="space-y-1">
                    {categoryEndpoints.map(e => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setActiveId(e.id);
                          setIsSidebarOpen(false);
                        }}
                        className={`sidebar-link w-full text-left group flex items-center justify-between ${activeId === e.id ? 'sidebar-link-active' : ''}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <div className={`w-2 h-2 rounded-full ${getMethodDot(e.method)} shadow-sm`} />
                          {e.id === "exam-overview" ? "Overview" : e.path.replace('/api/', '') || 'Index'}
                        </span>
                        <span className="text-[9px] font-bold opacity-30 group-hover:opacity-100 transition-opacity font-mono">
                          {e.method}
                        </span>
                      </button>
                    ))}
                  </nav>
                </div>
              );
            })}
          </div>
        </aside>

        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-sm"
            />
          )}
        </AnimatePresence>

        <main className="flex-1 min-w-0 flex flex-col lg:flex-row">
          <div className="flex-1 px-4 sm:px-6 py-10 max-w-3xl">
            <nav className="flex items-center gap-2 text-xs font-medium text-muted/70 mb-8">
              <span className="hover:text-foreground cursor-pointer transition-colors">Docs</span>
              <ChevronRight size={12} />
              <span className="hover:text-foreground cursor-pointer transition-colors">{activeEndpoint.category}</span>
              <ChevronRight size={12} />
              <span className="text-foreground">{activeEndpoint.id}</span>
            </nav>

            <motion.div
              key={activeEndpoint.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-6 mb-12">
                <div className="flex items-center gap-4">
                  <span className={`px-2.5 py-1 rounded-md text-[11px] font-black border tracking-wider ${getMethodColor(activeEndpoint.method)}`}>
                    {activeEndpoint.method}
                  </span>
                  <code className="text-sm font-mono text-accent font-semibold px-2 py-1 bg-accent/5 rounded">
                    {activeEndpoint.path}
                  </code>
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight leading-tight">{activeEndpoint.description}</h1>
                <p className="text-lg text-muted leading-relaxed">
                  The <span className="text-foreground font-semibold">{activeEndpoint.id}</span> endpoint facilitates critical operations within the <span className="text-foreground font-semibold">{activeEndpoint.category.toLowerCase()}</span> domain.
                  Below are the detailed specifications for requests and responses.
                </p>
              </div>

              {activeEndpoint.flow ? (
                <section className="space-y-8 mb-16">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold tracking-tight">Exam Workflow</h2>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                  <p className="text-sm text-muted leading-relaxed mb-8">
                    The exam system follows two distinct flows. <strong className="text-foreground">Admins</strong> create and publish exams,
                    while <strong className="text-foreground">users</strong> enroll, take, and submit them. Each step below links to the corresponding endpoint documentation.
                  </p>
                  <FlowChart lanes={activeEndpoint.flow} />
                </section>
              ) : (
                <>
              {activeEndpoint.auth && (
                <div className="mb-12 p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Shield size={20} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">Authentication Required</p>
                    <p className="text-sm text-muted leading-normal">
                      Requests must include a valid JWT token in the <code>Authorization: Bearer</code> header.
                    </p>
                  </div>
                </div>
              )}

              <section className="space-y-6 mb-16" id="request-body">
                <div className="next-card bg-surface shadow-lg border-border/50">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-bold tracking-tight">Request Body</h2>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                  {activeEndpoint.payloadFields ? (
                    <div className="rounded-xl border border-border overflow-hidden bg-background/20">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[500px] sm:min-w-0">
                          <thead className="bg-sidebar text-muted font-bold uppercase text-[10px] tracking-widest border-b border-border">
                            <tr>
                              <th className="px-4 sm:px-6 py-4">Property</th>
                              <th className="px-4 sm:px-6 py-4">Type</th>
                              <th className="px-4 sm:px-6 py-4">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {activeEndpoint.payloadFields.map(field => (
                              <tr key={field.name} className="hover:bg-surface-hover/50 transition-colors">
                                <td className="px-4 sm:px-6 py-4 sm:py-5">
                                  <div className="flex flex-col gap-1.5">
                                    <span className="font-mono text-foreground font-bold">{field.name}</span>
                                    {field.required && (
                                      <span className="text-[9px] text-rose-500 font-black uppercase tracking-widest bg-rose-500/10 px-1.5 py-0.5 rounded inline-block w-fit">Required</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 sm:px-6 py-4 sm:py-5">
                                  <span className="font-mono text-xs text-muted/80 bg-muted/5 px-2 py-1 rounded">{field.type}</span>
                                </td>
                                <td className="px-4 sm:px-6 py-4 sm:py-5 text-muted leading-relaxed text-[13px] sm:text-sm">{field.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : activeEndpoint.payload ? (
                    <div className="rounded-xl border border-border overflow-hidden bg-background/20">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[500px] sm:min-w-0">
                          <thead className="bg-sidebar text-muted font-bold uppercase text-[10px] tracking-widest border-b border-border">
                            <tr>
                              <th className="px-4 sm:px-6 py-4">Property</th>
                              <th className="px-4 sm:px-6 py-4">Type</th>
                              <th className="px-4 sm:px-6 py-4">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {Object.keys(activeEndpoint.payload).map(key => (
                              <tr key={key} className="hover:bg-surface-hover/50 transition-colors">
                                <td className="px-4 sm:px-6 py-4 font-mono text-foreground font-bold">{key}</td>
                                <td className="px-4 sm:px-6 py-4 font-mono text-xs text-muted/80">string</td>
                                <td className="px-4 sm:px-6 py-4 text-muted italic text-[13px]">Standard parameter.</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-2xl border-2 border-dashed border-border bg-sidebar/50 text-center">
                      <p className="text-muted italic text-sm">No body parameters required for this endpoint.</p>
                    </div>
                  )}
                </div>
              </section>

              {activeEndpoint.responseFields && (
                <section className="space-y-6 mb-16" id="response-schema">
                  <div className="next-card bg-surface shadow-lg border-border/50">
                    <div className="flex items-center gap-3 mb-6">
                      <h2 className="text-xl font-bold tracking-tight">Response Schema</h2>
                      <div className="h-px flex-1 bg-border/40" />
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden bg-background/20">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[500px] sm:min-w-0">
                          <thead className="bg-sidebar text-muted font-bold uppercase text-[10px] tracking-widest border-b border-border">
                            <tr>
                              <th className="px-4 sm:px-6 py-4">Property</th>
                              <th className="px-4 sm:px-6 py-4">Type</th>
                              <th className="px-4 sm:px-6 py-4">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {activeEndpoint.responseFields.map(field => (
                              <tr key={field.name} className="hover:bg-surface-hover/50 transition-colors">
                                <td className="px-4 sm:px-6 py-4 font-mono text-foreground font-bold">{field.name}</td>
                                <td className="px-4 sm:px-6 py-4 font-mono text-xs text-muted/80 bg-muted/5 px-2 py-1 rounded">{field.type}</td>
                                <td className="px-4 sm:px-6 py-4 text-muted leading-relaxed text-[13px] sm:text-sm">{field.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              </>
              )}

              {!activeEndpoint.flow && (
              <div className="lg:hidden space-y-8">
                <h2 className="text-2xl font-bold tracking-tight pb-4 border-b border-border">Example Request</h2>
                <div className="next-card bg-code-bg border-border/50 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/30" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30" />
                    </div>
                    <button
                      onClick={() => copyToClipboard(`curl -X ${activeEndpoint.method} ${API_BASE}${activeEndpoint.path}`, activeEndpoint.id)}
                      className="p-2 hover:bg-surface-hover rounded-lg text-muted hover:text-foreground transition-all"
                    >
                      {copiedId === activeEndpoint.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <pre className="text-[13px] font-mono leading-relaxed overflow-x-auto p-4 rounded-lg bg-black/5 dark:bg-white/5">
                    <span className="text-muted/60">curl</span> <span className="text-rose-400 font-bold">-X</span> <span className="text-foreground">{activeEndpoint.method}</span> \<br />
                    &nbsp;&nbsp;<span className="text-json-string">"{API_BASE}{activeEndpoint.path}"</span> \<br />
                    {activeEndpoint.payload && (
                      <>&nbsp;&nbsp;<span className="text-muted/60">-d '{JSON.stringify(activeEndpoint.payload, null, 2)}' \</span><br /></>
                    )}
                    {activeEndpoint.auth && (
                      <>&nbsp;&nbsp;<span className="text-muted/60">-H</span> <span className="text-json-string">"Authorization: Bearer TOKEN"</span></>
                    )}
                  </pre>
                </div>
              </div>
              )}

              <div className="flex justify-between items-center mt-20 pt-12 border-t border-border">
                <button className="flex flex-col gap-1.5 items-start group">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted/50 group-hover:text-muted transition-colors">Previous</span>
                  <span className="font-bold text-accent flex items-center gap-1 group-hover:-translate-x-1 transition-transform">
                    Introduction
                  </span>
                </button>
                <button className="flex flex-col gap-1.5 items-end group text-right">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted/50 group-hover:text-muted transition-colors">Next</span>
                  <span className="font-bold text-accent flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Authentication
                  </span>
                </button>
              </div>
            </motion.div>
          </div>

          <aside className="hidden lg:block w-96 py-12 px-8 border-l border-border space-y-12 h-[calc(100vh-64px)] sticky top-16 overflow-y-auto bg-sidebar/30">
            {!activeEndpoint.flow ? (
              <>

            <div className="space-y-6">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">Example Request</h4>
              <div className="rounded-2xl bg-code-bg border border-border overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-5 py-3 bg-sidebar/50 border-b border-border">
                  <span className="text-[10px] font-bold font-mono text-muted/80 uppercase tracking-widest">cURL</span>
                  <button
                    onClick={() => copyToClipboard(`curl -X ${activeEndpoint.method} ${API_BASE}${activeEndpoint.path}`, activeEndpoint.id)}
                    className="p-1.5 hover:bg-surface rounded-lg transition-all text-muted hover:text-foreground"
                  >
                    {copiedId === activeEndpoint.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
                <div className="p-6">
                  <pre className="text-[13px] font-mono leading-relaxed overflow-x-auto">
                    <span className="text-muted/60">curl</span> <span className="text-rose-400 font-bold">-X</span> <span className="text-foreground">{activeEndpoint.method}</span> \<br />
                    &nbsp;&nbsp;<span className="text-json-string">"{API_BASE}{activeEndpoint.path}"</span> \<br />
                    {activeEndpoint.payload && (
                      <>&nbsp;&nbsp;<span className="text-muted/60">-d '{JSON.stringify(activeEndpoint.payload, null, 2)}' \</span><br /></>
                    )}
                    {activeEndpoint.auth && (
                      <>&nbsp;&nbsp;<span className="text-muted/60">-H</span> <span className="text-json-string">"Authorization: Bearer TOKEN"</span></>
                    )}
                  </pre>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">Response Body</h4>
                <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest">Status 200</div>
              </div>
              <div className="rounded-2xl bg-code-bg border border-border p-6 shadow-xl">
                <div className="text-[13px] font-mono leading-relaxed">
                  {renderJSON(activeEndpoint.response || { status: "success" })}
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-12 border-t border-border">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">On this page</h4>
              <nav className="space-y-3">
                <a href="#request-body" className="flex items-center gap-3 text-sm text-muted hover:text-accent transition-all group">
                  <div className="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-accent transition-colors" />
                  Request Body
                </a>
                {activeEndpoint.responseFields && (
                  <a href="#response-schema" className="flex items-center gap-3 text-sm text-muted hover:text-accent transition-all group">
                    <div className="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-accent transition-colors" />
                    Response Schema
                  </a>
                )}
                <a href="#" className="flex items-center gap-3 text-sm text-muted hover:text-accent transition-all group">
                  <div className="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-accent transition-colors" />
                  Example Request
                </a>
              </nav>
            </div>
            </>
            ) : (
              <div className="space-y-6">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">Legend</h4>
                <div className="rounded-2xl bg-surface border border-border p-6 shadow-lg space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border-2 border-get text-get bg-get/10 flex items-center justify-center text-[10px] font-black">G</div>
                    <div>
                      <p className="text-xs font-bold text-foreground">GET</p>
                      <p className="text-[10px] text-muted">Retrieve data</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border-2 border-post text-post bg-post/10 flex items-center justify-center text-[10px] font-black">P</div>
                    <div>
                      <p className="text-xs font-bold text-foreground">POST</p>
                      <p className="text-[10px] text-muted">Create / Submit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border-2 border-patch text-patch bg-patch/10 flex items-center justify-center text-[10px] font-black">A</div>
                    <div>
                      <p className="text-xs font-bold text-foreground">PATCH</p>
                      <p className="text-[10px] text-muted">Update</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border-2 border-delete text-delete bg-delete/10 flex items-center justify-center text-[10px] font-black">D</div>
                    <div>
                      <p className="text-xs font-bold text-foreground">DELETE</p>
                      <p className="text-[10px] text-muted">Remove</p>
                    </div>
                  </div>
                  <hr className="border-border/50" />
                  <p className="text-[10px] text-muted leading-relaxed">
                    Steps are numbered in execution order. The admin flow must be completed before users can interact with the exam.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </main>
      </div>

      <footer className="border-t border-border bg-surface/30">
        <div className="max-w-[1400px] mx-auto px-8 py-12 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-4 text-sm text-muted">
            <div className="w-8 h-8 rounded overflow-hidden flex items-center justify-center">
              <img src="/LE_Logo.png" alt="LE" className="w-full h-full object-contain" />
            </div>
            <span>&copy; {new Date().getFullYear()} Love Economy Training Infrastructure.</span>
          </div>
          <div className="flex gap-8 text-sm text-muted">
            <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
            <a href="#" className="hover:text-foreground transition-colors">Changelog</a>
            <a href="#" className="hover:text-foreground transition-colors">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
