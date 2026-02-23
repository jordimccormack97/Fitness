import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "fitness_app_sessions_v2";
const AUTH_KEY = "fitness_app_auth_v1";
const AI_MODE_KEY = "fitness_app_ai_mode_v1";
const AI_CHAT_ENDPOINT = "/api/ai/chat";
const AI_TRANSCRIBE_ENDPOINT = "/api/ai/transcribe";
const EXERCISE_OPTIONS_BY_DAY = {
  push: [
    "Barbell Bench Press",
    "Incline Dumbbell Press",
    "Seated Shoulder Press",
    "Cable Fly",
    "Lateral Raise",
    "Triceps Pushdown",
  ],
  pull: [
    "Deadlift",
    "Lat Pulldown",
    "Chest-Supported Row",
    "Single-Arm Dumbbell Row",
    "Face Pull",
    "EZ Bar Curl",
  ],
  leg: [
    "Back Squat",
    "Romanian Deadlift",
    "Leg Press",
    "Walking Lunge",
    "Leg Extension",
    "Hamstring Curl",
    "Standing Calf Raise",
  ],
  fullbody: [
    "Back Squat",
    "Romanian Deadlift",
    "Barbell Bench Press",
    "Lat Pulldown",
    "Seated Shoulder Press",
    "Walking Lunge",
    "Cable Row",
    "Plank",
  ],
};

function getSessionDayType(sessionName = "") {
  const lower = sessionName.toLowerCase();
  if (lower.includes("push")) return "push";
  if (lower.includes("pull")) return "pull";
  if (lower.includes("leg")) return "leg";
  if (lower.includes("full body") || lower.includes("fullbody")) return "fullbody";
  return null;
}

const VOICE_DURATION_OPTIONS = [30, 45, 60, 75];
const VOICE_TYPE_OPTIONS = ["Push", "Pull", "Legs", "Full Body"];
const VOICE_INTENSITY_OPTIONS = ["Light", "Moderate", "Hard"];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to encode audio for upload."));
    reader.readAsDataURL(blob);
  });
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return { loggedIn: false, name: "", walletAddress: "" };
    }
    return {
      loggedIn: Boolean(parsed.loggedIn),
      name: typeof parsed.name === "string" ? parsed.name : "",
      walletAddress: typeof parsed.walletAddress === "string" ? parsed.walletAddress : "",
    };
  } catch {
    return { loggedIn: false, name: "", walletAddress: "" };
  }
}

function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function createId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildMockCoachFeedback(sessionSummary) {
  const exercises = sessionSummary.exercises ?? [];
  const totalSets = exercises.reduce((sum, item) => sum + Number(item.sets || 0), 0);
  const totalVolume = exercises.reduce(
    (sum, item) => sum + Number(item.sets || 0) * Number(item.reps || 0) * Number(item.weight || 0),
    0
  );
  const topExercise = [...exercises].sort((a, b) => {
    const aVol = Number(a.sets || 0) * Number(a.reps || 0) * Number(a.weight || 0);
    const bVol = Number(b.sets || 0) * Number(b.reps || 0) * Number(b.weight || 0);
    return bVol - aVol;
  })[0];
  const topExerciseText = topExercise
    ? `${topExercise.exercise} (${topExercise.sets}x${topExercise.reps} @ ${topExercise.weight} lb)`
    : "No top movement yet.";
  const avgSets = exercises.length ? (totalSets / exercises.length).toFixed(1) : "0.0";

  return [
    "1) Quick summary",
    `Solid ${sessionSummary.name} session: ${exercises.length} exercises, ${totalSets} sets, ${totalVolume.toLocaleString()} lb total volume.`,
    `Top lift today: ${topExerciseText}`,
    "",
    "2) What to improve next session",
    `- Progress one anchor lift by +1 rep or +5 lb while keeping form strict.`,
    `- Keep effort balanced: average sets per exercise is ${avgSets}; add one back-off set if energy is good.`,
    "- Keep rest times consistent (90-150 sec compounds, 60-90 sec accessories) to improve comparability.",
    "",
    "3) Optional: form/safety reminder",
    "Prioritize full range of motion and stop any set that causes sharp pain.",
    "",
    "(Test mode: local mock coach response, no API tokens used.)",
  ].join("\n");
}

function buildMockWorkoutPlan({ minutes, focus, objective, soreness }) {
  const focusLabel = focus || "chest";
  const totalMinutes = Math.max(Number(minutes) || 45, 20);
  const warmupMinutes = 6;
  const finisherMinutes = soreness ? 8 : 5;
  const workMinutes = Math.max(totalMinutes - warmupMinutes - finisherMinutes, 10);
  const blockMinutes = Math.floor(workMinutes / 3);
  const repStyle = soreness ? "8-12 reps with controlled eccentric" : "6-10 reps";

  return [
    `Workout Plan (${totalMinutes} min) - Focus: ${focusLabel}`,
    `Goal: ${objective || "Build muscle size with hard, high-quality sets."}`,
    "",
    `1) Warm-up (${warmupMinutes} min)`,
    "- 2 rounds: band pull-aparts x15, incline push-ups x10, shoulder circles x20 sec",
    "- 2 progressive warm-up sets on first press movement",
    "",
    `2) Main Block A (${blockMinutes} min)`,
    `- Incline dumbbell press: 4 sets x ${repStyle}, rest 90 sec`,
    "- Last set: rest-pause (10-15 sec pause, then 2-4 extra reps)",
    "",
    `3) Main Block B (${blockMinutes} min)`,
    "- Flat machine or barbell press: 3-4 sets x 6-10 reps, rest 2 min",
    "- Pair with cable fly: 3 sets x 12-15 reps, rest 60 sec",
    "",
    `4) Finisher (${finisherMinutes} min)`,
    soreness
      ? "- Push-up mechanical drop set x 2 rounds to near failure"
      : "- Pec-deck or cable fly 2 sets x 15-20 reps",
    soreness
      ? "- Dumbbell fly stretch hold 30 sec between rounds"
      : "- Slow eccentric on final set (3 sec lowering)",
    "",
    "Intensity notes",
    "- Keep 1-2 reps in reserve on first working sets, then push final set near failure.",
    "- Prioritize full range and chest stretch at bottom of pressing/fly movements.",
    "",
    "Progression for next session",
    "- Add 1 rep per set before increasing load by 2.5-5%.",
    "",
    "(Test mode: local mock workout planner, no API tokens used.)",
  ].join("\n");
}

function buildMockPlanRevision({ basePlanText, changeRequest }) {
  return [
    "Revised Plan",
    `Requested changes: ${changeRequest}`,
    "",
    "Key updates",
    "- Reduced early fatigue by lowering first compound set intensity.",
    "- Added a gradual ramp to working weight before top sets.",
    "- Preserved total session time while keeping hypertrophy focus.",
    "",
    "Suggested structure",
    "- Keep warm-up as written, but add one extra transition set at 70-75%.",
    "- Move hardest set to set 2 or 3 instead of first working set.",
    "- Keep final set near failure only if bar speed remains controlled.",
    "",
    "Reference",
    basePlanText.slice(0, 220) + (basePlanText.length > 220 ? "..." : ""),
    "",
    "(Test mode: local mock revision, no API tokens used.)",
  ].join("\n");
}

function buildPrefilledExercisesFromPlan(planText, focusHint = "") {
  if (!planText?.trim()) return [];

  const sections = parseWorkoutPlan(planText);
  const warmupSection =
    sections.find((section) => section.title.toLowerCase().includes("warm-up")) ??
    sections.find((section) => section.title.toLowerCase().includes("warm up")) ??
    null;
  const exerciseSection =
    sections.find((section) => section.title.toLowerCase().includes("exercise")) ?? null;
  const lines = (exerciseSection ? exerciseSection.items : planText.split("\n"))
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  const noise = ["rest", "coach", "cue", "stop rule", "what changed", "intensity", "progression", "note"];
  const seen = new Set();
  const planned = [];

  if (warmupSection && warmupSection.items.length > 0) {
    const warmupSteps = warmupSection.items
      .flatMap((item) =>
        item
          .replace(/^[-*]\s*/, "")
          .replace(/^\d+\s*rounds?:\s*/i, "")
          .split(",")
          .map((part) => part.trim())
      )
      .filter(Boolean);

    planned.push({
      id: createId(),
      name: warmupSection.title.trim(),
      sets: Math.max(warmupSteps.length, 1),
      reps: 1,
      weight: 0,
      createdAt: new Date().toISOString(),
      planned: true,
      completedSets: 0,
      completed: false,
      warmupSteps,
    });
    seen.add(warmupSection.title.trim().toLowerCase());
  }

  for (const raw of lines) {
    const lower = raw.toLowerCase();
    if (noise.some((word) => lower.includes(word))) continue;

    let name = raw.replace(/^[-*]\s*/, "").trim();
    if (name.includes(":")) name = name.split(":")[0].trim();
    if (name.includes(" - ")) name = name.split(" - ")[0].trim();
    name = name
      .replace(/^pair with\s+/i, "")
      .replace(/^set\s+\d+\s*/i, "")
      .replace(/^main block\s+[a-z]\s*/i, "")
      .replace(/^finisher\s*/i, "")
      .replace(/^warm-?up\s*/i, "")
      .replace(/^\d+\s*rounds?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const nameLower = name.toLowerCase();
    if (/^\d/.test(name)) continue;
    if (/^(last set|set|working progression|session structure|goal|focus|session|key updates|reference)$/i.test(name)) continue;
    if (
      nameLower.includes("workout plan") ||
      nameLower.includes("session length") ||
      nameLower.includes("wants to be sore") ||
      nameLower.includes("requested changes") ||
      nameLower.includes("what changed") ||
      nameLower.includes("coaching cue") ||
      nameLower.includes("test mode")
    ) {
      continue;
    }
    if (nameLower.startsWith("(") && nameLower.endsWith(")")) continue;
    if (name.length < 3) continue;
    if (!/[a-z]/i.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;

    const setsMatch = raw.match(/(\d+)\s*(?:sets?|x)\b/i);
    const repsMatch = raw.match(/(\d+)(?:\s*-\s*\d+)?\s*reps?\b/i);
    const weightMatch = raw.match(/(?:@|at)?\s*(\d+(?:\.\d+)?)\s*(?:kg|lb|lbs)\b/i);
    const sets = setsMatch ? Number(setsMatch[1]) : 3;
    const reps = repsMatch ? Number(repsMatch[1]) : 10;
    const weight = weightMatch ? Number(weightMatch[1]) : 0;

    planned.push({
      id: createId(),
      name,
      sets: Number.isFinite(sets) && sets > 0 ? sets : 3,
      reps: Number.isFinite(reps) && reps > 0 ? reps : 10,
      weight: Number.isFinite(weight) && weight >= 0 ? weight : 0,
      createdAt: new Date().toISOString(),
      planned: true,
      completedSets: 0,
      completed: false,
      warmupSteps: [],
    });
    seen.add(name.toLowerCase());
  }

  if (planned.length > 0) return planned.slice(0, 10);

  const focus = focusHint.toLowerCase();
  const fallback =
    focus.includes("pull") || focus.includes("back")
      ? ["Lat Pulldown", "Chest-Supported Row", "Face Pull"]
      : focus.includes("leg")
        ? ["Back Squat", "Romanian Deadlift", "Walking Lunge"]
        : ["Incline Dumbbell Press", "Flat Press", "Cable Fly"];

  return fallback.map((name) => ({
    id: createId(),
    name,
    sets: 3,
    reps: 10,
    weight: 0,
    createdAt: new Date().toISOString(),
    planned: true,
    completedSets: 0,
    completed: false,
    warmupSteps: [],
  }));
}

function parseWorkoutPlan(planText) {
  const lines = planText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = [];
  let current = null;
  for (const line of lines) {
    const titleMatch = line.match(/^\d+\)\s*(.+)$/);
    if (titleMatch) {
      current = { title: titleMatch[1], items: [] };
      sections.push(current);
      continue;
    }
    const bulletMatch = line.match(/^[-*]\s*(.+)$/);
    if (bulletMatch) {
      if (!current) {
        current = { title: "Plan Details", items: [] };
        sections.push(current);
      }
      current.items.push(bulletMatch[1]);
      continue;
    }

    if (!current) {
      current = { title: "Plan Summary", items: [] };
      sections.push(current);
    }
    current.items.push(line);
  }
  return sections;
}

function buildMockNextStepRecommendation({ activeSession, targetExercise, sessions }) {
  const lift = targetExercise?.trim() || "current exercise";
  const allEntries = sessions
    .flatMap((session) => session.exercises ?? [])
    .filter((exercise) => exercise.name.trim().toLowerCase() === lift.toLowerCase())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const lastEntry = allEntries[allEntries.length - 1] ?? null;
  const referenceWeight = lastEntry ? Number(lastEntry.weight) : 20;
  const warmup1 = Math.max(Math.round(referenceWeight * 0.45), 10);
  const warmup2 = Math.max(Math.round(referenceWeight * 0.65), 15);
  const working1 = Math.max(Math.round(referenceWeight * 0.85), 20);
  const working2 = Math.max(Math.round(referenceWeight * 0.95), 22);
  const working3 = Math.max(Math.round(referenceWeight), 25);
  const stepUp = referenceWeight >= 135 ? 10 : 5;

  return [
    `Next Step for ${lift}`,
    `Session: ${activeSession?.name || "Workout"}`,
    "",
    "Warm-up ramp",
    `- Set 1: ${warmup1} lb x 12 reps`,
    `- Set 2: ${warmup2} lb x 8 reps`,
    "- Rest 60-90 sec between warm-up sets",
    "",
    "Working progression",
    `- Set 1: ${working1} lb x 10 reps`,
    `- Set 2: ${working2} lb x 8 reps`,
    `- Set 3: ${working3} lb x AMRAP (leave 1 rep in reserve)`,
    "",
    "Coach note",
    lastEntry
      ? `Last logged ${lift}: ${lastEntry.sets}x${lastEntry.reps} @ ${lastEntry.weight} lb. If bar path is clean, add ${stepUp} lb next session.`
      : `No prior ${lift} logs found. Start conservative and add ${stepUp} lb only if reps stay clean.`,
    "",
    "(Test mode: local mock recommendation, no API tokens used.)",
  ].join("\n");
}

function buildMockWarmupRecommendation({ activeSession, targetExercise, sessions }) {
  const full = buildMockNextStepRecommendation({ activeSession, targetExercise, sessions }).split("\n");
  const warmupLines = [];
  let inWarmup = false;
  for (const line of full) {
    if (line.toLowerCase().includes("warm-up ramp")) {
      inWarmup = true;
      warmupLines.push("Warm-up ramp");
      continue;
    }
    if (inWarmup && line.toLowerCase().includes("working progression")) break;
    if (inWarmup) warmupLines.push(line);
  }
  return [
    `Warm-up recommendation for ${targetExercise}`,
    `Session: ${activeSession?.name || "Workout"}`,
    "",
    ...warmupLines.filter(Boolean),
    "",
    "Rule: move to working sets only when tempo stays controlled.",
    "(Test mode: local warm-up recommendation, no API tokens used.)",
  ].join("\n");
}

export default function App() {
  const initialAiMode = import.meta.env.VITE_AI_MODE === "live" ? "live" : "mock";
  const [auth, setAuth] = useState(() => loadAuth());
  const [walletAddress, setWalletAddress] = useState(() => loadAuth().walletAddress || "");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [sessions, setSessions] = useState(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [pendingActiveSessionId, setPendingActiveSessionId] = useState(null);
  const [exerciseName, setExerciseName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("0");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [nextStepText, setNextStepText] = useState("");
  const [nextStepLoading, setNextStepLoading] = useState(false);
  const [planMinutes, setPlanMinutes] = useState("45");
  const [planFocus, setPlanFocus] = useState("Chest");
  const [planObjective, setPlanObjective] = useState(
    "Make me sore tomorrow and focused on getting a bigger chest."
  );
  const [planSoreness, setPlanSoreness] = useState(true);
  const [planText, setPlanText] = useState("");
  const [planChanges, setPlanChanges] = useState("");
  const [showPlanChanges, setShowPlanChanges] = useState(false);
  const [revisedPlanText, setRevisedPlanText] = useState("");
  const [planRevisionLoading, setPlanRevisionLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [aiMode, setAiMode] = useState(() => localStorage.getItem(AI_MODE_KEY) || initialAiMode);
  const [page, setPage] = useState(() => (loadAuth().loggedIn ? "start" : "home"));
  const [startView, setStartView] = useState("quick");
  const [plannerEntryMode, setPlannerEntryMode] = useState("menu");
  const [logDayType, setLogDayType] = useState("");
  const [logExerciseStage, setLogExerciseStage] = useState("day");
  const [logNeedsTypeSelection, setLogNeedsTypeSelection] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chartRange, setChartRange] = useState("90d");
  const startWorkoutLockRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const voiceStopTimerRef = useRef(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceResponse, setVoiceResponse] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceFlowStep, setVoiceFlowStep] = useState("actions");
  const [voiceFlowSelections, setVoiceFlowSelections] = useState({
    duration: "",
    type: "",
    intensity: "",
  });
  const [manualTypeSelected, setManualTypeSelected] = useState(false);
  const [manualDurationSelected, setManualDurationSelected] = useState(false);
  const [manualIntensitySelected, setManualIntensitySelected] = useState(false);
  const [manualIntensityChoice, setManualIntensityChoice] = useState("");
  const [manualGoalEnabled, setManualGoalEnabled] = useState(false);



  useEffect(() => {
    saveAuth(auth);
  }, [auth]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(AI_MODE_KEY, aiMode);
  }, [aiMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceSupported(
      Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (voiceStopTimerRef.current) {
          window.clearTimeout(voiceStopTimerRef.current);
          voiceStopTimerRef.current = null;
        }
        mediaRecorderRef.current?.stop?.();
      } catch {
        // No-op
      }
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSessionId(null);
      setPendingActiveSessionId(null);
      return;
    }
    if (
      pendingActiveSessionId &&
      sessions.some((session) => session.id === pendingActiveSessionId)
    ) {
      setActiveSessionId(pendingActiveSessionId);
      setPage("log");
      setPendingActiveSessionId(null);
      return;
    }
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId, pendingActiveSessionId]);

  useEffect(() => {
    setMenuOpen(false);
  }, [page]);

  useEffect(() => {
    if (page !== "start" && startView !== "quick") {
      setStartView("quick");
    }
  }, [page, startView]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const exerciseOptions = useMemo(() => {
    if (logExerciseStage === "day") {
      return ["Push Day", "Pull Day", "Leg Day", "Full Body Day"];
    }
    const dayType = logDayType || getSessionDayType(activeSession?.name || "");
    if (!dayType) return [];
    return EXERCISE_OPTIONS_BY_DAY[dayType] ?? [];
  }, [activeSession, logDayType, logExerciseStage]);

  useEffect(() => {
    if (!activeSession) return;
    const dayType = getSessionDayType(activeSession.name);
    if (dayType) {
      setLogDayType(dayType);
    }
  }, [activeSession]);

  useEffect(() => {
    if (page !== "log") return;
    if (logNeedsTypeSelection) {
      setLogExerciseStage("day");
      setExerciseName("");
      return;
    }
    const activeDayType = getSessionDayType(activeSession?.name || "");
    if (activeSession?.startedFromStartMenu && activeDayType) {
      setLogDayType(activeDayType);
      setLogExerciseStage("exercise");
      setExerciseName("");
      return;
    }
    setLogExerciseStage("day");
    setExerciseName("");
  }, [page, activeSession, logNeedsTypeSelection]);

  useEffect(() => {
    if (!activeSession) return;
    if (!exerciseName) return;
    if (!exerciseOptions.includes(exerciseName)) {
      setExerciseName("");
    }
  }, [activeSession, exerciseName, exerciseOptions]);

  const totals = useMemo(() => {
    const allExercises = sessions.flatMap((session) => session.exercises ?? []);
    const totalSets = allExercises.reduce((sum, exercise) => sum + exercise.sets, 0);
    const totalVolume = allExercises.reduce(
      (sum, exercise) => sum + exercise.sets * exercise.reps * exercise.weight,
      0
    );

    return {
      sessions: sessions.length,
      exercises: allExercises.length,
      sets: totalSets,
      volume: totalVolume,
    };
  }, [sessions]);

  const planSections = useMemo(() => parseWorkoutPlan(planText), [planText]);
  const revisedPlanSections = useMemo(() => parseWorkoutPlan(revisedPlanText), [revisedPlanText]);

  const progress = useMemo(() => {
    const chronological = [...sessions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const rangeDays = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      all: null,
    }[chartRange];

    const now = Date.now();
    const filteredSessions =
      rangeDays == null
        ? chronological
        : chronological.filter((session) => {
            const createdAt = new Date(session.createdAt).getTime();
            if (Number.isNaN(createdAt)) return false;
            return now - createdAt <= rangeDays * 24 * 60 * 60 * 1000;
          });

    const points = filteredSessions.slice(-10).map((session) => {
      const exercises = session.exercises ?? [];
      const volume = exercises.reduce(
        (sum, exercise) => sum + exercise.sets * exercise.reps * exercise.weight,
        0
      );
      const sets = exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
      return {
        id: session.id,
        name: session.name,
        date: session.createdAt,
        complete: session.complete,
        exercises: exercises.length,
        sets,
        volume,
      };
    });

    const cumulative = [];
    let runningVolume = 0;
    for (const point of points) {
      runningVolume += point.volume;
      cumulative.push({
        id: point.id,
        date: point.date,
        value: runningVolume,
      });
    }

    const totalComplete = filteredSessions.filter((session) => session.complete).length;
    const completionRate = filteredSessions.length
      ? (totalComplete / filteredSessions.length) * 100
      : 0;
    const avgVolume = points.length
      ? points.reduce((sum, point) => sum + point.volume, 0) / points.length
      : 0;
    const maxVolume = points.length ? Math.max(...points.map((point) => point.volume), 1) : 1;

    const exerciseMap = new Map();
    for (const session of filteredSessions) {
      for (const exercise of session.exercises ?? []) {
        const key = exercise.name.trim().toLowerCase();
        if (!key) continue;
        const entry = exerciseMap.get(key) ?? {
          name: exercise.name.trim(),
          count: 0,
          volume: 0,
        };
        entry.count += 1;
        entry.volume += exercise.sets * exercise.reps * exercise.weight;
        exerciseMap.set(key, entry);
      }
    }

    const topExercises = [...exerciseMap.values()]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
    const topExerciseMax = topExercises.length
      ? Math.max(...topExercises.map((exercise) => exercise.volume), 1)
      : 1;

    return {
      points,
      cumulative,
      completionRate,
      avgVolume,
      maxVolume,
      filteredSessionCount: filteredSessions.length,
      topExercises,
      topExerciseMax,
    };
  }, [sessions, chartRange]);

  const canAddExercise =
    activeSession &&
    exerciseName.trim().length > 0 &&
    Number(sets) > 0 &&
    Number(reps) > 0 &&
    Number(weight) >= 0;

  function startWorkoutNow(workoutName, options = {}) {
    if (startWorkoutLockRef.current) return;
    startWorkoutLockRef.current = true;

    const { prefilledExercises = [], fromPlan = false, startedFromStartMenu = false } = options;
    const normalizedExercises = (prefilledExercises ?? []).map((exercise) => ({
      ...exercise,
      completedSets: Number(exercise.completedSets ?? 0),
      completed: Boolean(exercise.completed),
    }));
    const name = workoutName?.trim() || "Workout";
    const inferredDayType = getSessionDayType(name);
    if (inferredDayType) {
      setLogDayType(inferredDayType);
    }
    setLogNeedsTypeSelection(false);
    const created = {
      id: createId(),
      name,
      complete: false,
      createdAt: new Date().toISOString(),
      exercises: normalizedExercises,
      fromPlan,
      startedFromStartMenu,
    };
    setPendingActiveSessionId(created.id);
    setSessions((prev) => [created, ...prev]);
    setActiveSessionId(created.id);
    setPage("log");
    window.setTimeout(() => {
      startWorkoutLockRef.current = false;
    }, 350);
  }

  function beginWorkoutFromPlan() {
    const focusName = planFocus.trim() || "Workout";
    const nextSessionName = /day$/i.test(focusName) ? focusName : `${focusName} Day`;
    const sourcePlan = revisedPlanText || planText;
    const prefilled = buildPrefilledExercisesFromPlan(sourcePlan, focusName);
    startWorkoutNow(nextSessionName, {
      prefilledExercises: prefilled,
      fromPlan: true,
      startedFromStartMenu: true,
    });
    requestAnimationFrame(() => setPage("log"));
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function completePlannedWorkout() {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSession.id
          ? { ...session, complete: true, finishedAt: new Date().toISOString() }
          : session
      )
    );
  }

  function completePlannedSet(exerciseId) {
    if (!activeSession?.fromPlan) return;
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSession.id) return session;
        return {
          ...session,
          exercises: (session.exercises ?? []).map((exercise) => {
            if (exercise.id !== exerciseId) return exercise;
            const maxSets = Math.max(Number(exercise.sets) || 0, 0);
            const nextCompletedSets = Math.min((Number(exercise.completedSets) || 0) + 1, maxSets);
            return {
              ...exercise,
              completedSets: nextCompletedSets,
              completed: nextCompletedSets >= maxSets,
            };
          }),
        };
      })
    );
  }

  function completePlannedExercise(exerciseId) {
    if (!activeSession?.fromPlan) return;
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSession.id) return session;
        return {
          ...session,
          exercises: (session.exercises ?? []).map((exercise) =>
            exercise.id === exerciseId
              ? {
                  ...exercise,
                  completedSets: Number(exercise.sets) || 0,
                  completed: true,
                }
              : exercise
          ),
        };
      })
    );
  }

  function deleteSession(sessionId) {
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
  }

  function toggleSessionComplete(sessionId) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, complete: !session.complete } : session
      )
    );
  }

  function addExercise(event) {
    event.preventDefault();
    if (!canAddExercise) return;

    const nextExercise = {
      id: createId(),
      name: exerciseName.trim(),
      sets: Number(sets),
      reps: Number(reps),
      weight: Number(weight),
      createdAt: new Date().toISOString(),
    };

    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? { ...session, exercises: [nextExercise, ...session.exercises] }
          : session
      )
    );

    setExerciseName("");
    setSets("3");
    setReps("10");
    setWeight("0");
    const activeDayType = getSessionDayType(activeSession?.name || "");
    if (activeSession?.startedFromStartMenu && activeDayType) {
      setLogExerciseStage("exercise");
      setLogDayType(activeDayType);
    } else {
      setLogExerciseStage("day");
    }
  }

  function handleExerciseNameChange(value) {
    const normalized = value.trim().toLowerCase();
    const dayByInput = {
      "push day": "Push Day",
      push: "Push Day",
      "pull day": "Pull Day",
      pull: "Pull Day",
      "leg day": "Leg Day",
      leg: "Leg Day",
      legs: "Leg Day",
      "full body day": "Full Body Day",
      "full body": "Full Body Day",
      fullbody: "Full Body Day",
    };

    if (logExerciseStage === "day") {
      const selectedDay = dayByInput[normalized];
      if (!selectedDay) {
        setExerciseName(value);
        return;
      }

      const dayType = getSessionDayType(selectedDay);
      if (dayType) {
        setLogDayType(dayType);
      }
      setExerciseName("");
      setLogExerciseStage("exercise");
      setLogNeedsTypeSelection(false);

      const activeDay = getSessionDayType(activeSession?.name || "");
      if (!activeSession || activeDay !== dayType) {
        startWorkoutNow(selectedDay, { startedFromStartMenu: true });
      }
      return;
    }

    setExerciseName(value);
  }

  function removeExercise(sessionId, exerciseId) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              exercises: session.exercises.filter((exercise) => exercise.id !== exerciseId),
            }
          : session
      )
    );
  }

  function enterApp() {
    setAuth({ loggedIn: true, name: "", walletAddress });
    setStartView("quick");
    setPage("start");
  }

  function goToStartQuick() {
    setStartView("quick");
    setPage("start");
  }

  function goToLogFromHeader() {
    setLogNeedsTypeSelection(true);
    setPage("log");
  }

  function cleanupVoiceMedia() {
    if (voiceStopTimerRef.current) {
      window.clearTimeout(voiceStopTimerRef.current);
      voiceStopTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function stopVoiceCapture() {
    try {
      if (voiceStopTimerRef.current) {
        window.clearTimeout(voiceStopTimerRef.current);
        voiceStopTimerRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        cleanupVoiceMedia();
        setVoiceListening(false);
      }
    } catch {
      // No-op
    }
  }

  async function transcribeAudioWithMistral(audioBlob) {
    const audioBase64 = await blobToBase64(audioBlob);
    const res = await fetch(AI_TRANSCRIBE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64,
        mimeType: audioBlob.type || "audio/webm",
        fileName: "voice-input.webm",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Voice transcription failed: ${text}`);
    }
    const data = await res.json();
    return String(data?.text ?? "").trim();
  }

  function startVoiceCapture() {
    if (voiceListening) {
      stopVoiceCapture();
      return;
    }
    if (typeof window === "undefined") return;
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) return;
    setVoiceResponse("");
    void (async () => {
      try {
        stopVoiceCapture();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;

        recorder.onstart = () => {
          setVoiceListening(true);
        };
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = () => {
          setVoiceListening(false);
          setVoiceResponse(
            "Microphone capture failed. Please allow mic permission and try again."
          );
          cleanupVoiceMedia();
        };
        recorder.onstop = async () => {
          setVoiceListening(false);
          cleanupVoiceMedia();
          if (!chunks.length) {
            setVoiceResponse("No voice detected. Try speaking closer to the microphone.");
            return;
          }
          try {
            setVoiceLoading(true);
            const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            const transcript = await transcribeAudioWithMistral(audioBlob);
            if (!transcript) {
              setVoiceResponse("I couldn't transcribe that audio. Please try again.");
              return;
            }
            setVoiceTranscript(transcript);
            await askMistralVoiceCoach(transcript);
          } catch (error) {
            setVoiceResponse(error instanceof Error ? error.message : "Voice transcription failed.");
            return;
          } finally {
            setVoiceLoading(false);
          }
        };

        recorder.start();
        voiceStopTimerRef.current = window.setTimeout(() => {
          stopVoiceCapture();
        }, 7000);
      } catch (error) {
        setVoiceListening(false);
        cleanupVoiceMedia();
        setVoiceResponse(
          error instanceof Error ? error.message : "Unable to start microphone recording."
        );
      }
    })();
  }

  async function askMistralVoiceCoach(voicePrompt = "") {
    const promptText = (voicePrompt || voiceTranscript).trim();
    if (!promptText) return;
    setVoiceLoading(true);
    setVoiceResponse("");
    setVoiceFlowStep("actions");
    const durationMatch = promptText.match(/(\d{2,3})\s*(?:min|mins|minute|minutes)\b/i);
    const detectedDuration = durationMatch ? `${Number(durationMatch[1])} min` : "";
    const detectedType = /full\s*body/i.test(promptText)
      ? "Full Body"
      : /push/i.test(promptText)
        ? "Push"
        : /pull/i.test(promptText)
          ? "Pull"
          : /leg/i.test(promptText)
            ? "Legs"
            : "";
    const detectedIntensity = /hard|intense|sore|heavy/i.test(promptText)
      ? "Hard"
      : /light|easy/i.test(promptText)
        ? "Light"
        : /moderate/i.test(promptText)
          ? "Moderate"
          : "";

    const nextSelections = {
      duration: detectedDuration,
      type: detectedType,
      intensity: detectedIntensity,
    };
    setVoiceFlowSelections(nextSelections);
    if (detectedDuration) {
      setPlanMinutes(String(Number.parseInt(detectedDuration, 10) || 45));
    }
    if (detectedType) {
      setPlanFocus(detectedType);
    }
    if (detectedIntensity) {
      setPlanSoreness(detectedIntensity === "Hard");
    }
    const missing = [];
    if (!detectedDuration) missing.push("duration");
    if (!detectedType) missing.push("type");
    if (!detectedIntensity) missing.push("intensity");

    const guidedResponse = [
      `Got it: "${promptText}"`,
      "",
      missing.length === 0
        ? "I captured duration, type, and intensity. You can generate your workout plan now."
        : `I still need: ${missing.join(", ")}.`,
    ].join("\n");

    setVoiceResponse(guidedResponse);
    setVoiceLoading(false);
  }

  function buildVoicePlannerPayload() {
    const transcript = voiceTranscript.trim();
    const durationFromSelection = Number.parseInt(voiceFlowSelections.duration, 10);
    const durationMatch = transcript.match(/(\d{2,3})\s*(?:min|mins|minute|minutes)\b/i);
    const durationFromTranscript = durationMatch ? Number(durationMatch[1]) : 0;
    const minutes = durationFromSelection || durationFromTranscript || Number(planMinutes) || 45;

    let focus = voiceFlowSelections.type || planFocus.trim() || "Chest";
    if (!voiceFlowSelections.type && transcript) {
      if (/push/i.test(transcript)) focus = "Push";
      else if (/pull/i.test(transcript)) focus = "Pull";
      else if (/leg/i.test(transcript)) focus = "Legs";
      else if (/full\s*body/i.test(transcript)) focus = "Full Body";
      else if (/chest/i.test(transcript)) focus = "Chest";
      else if (/back/i.test(transcript)) focus = "Back";
      else if (/shoulder/i.test(transcript)) focus = "Shoulders";
    }

    let intensity = voiceFlowSelections.intensity;
    if (!intensity && transcript) {
      if (/hard|intense|sore|heavy/i.test(transcript)) intensity = "Hard";
      else if (/light|easy/i.test(transcript)) intensity = "Light";
      else intensity = "Moderate";
    }

    const soreness =
      intensity === "Hard" ? true : intensity === "Light" ? false : Boolean(planSoreness);
    const objective = [
      transcript || planObjective.trim() || "Build muscle with a structured workout.",
      intensity ? `Intensity: ${intensity}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return { minutes, focus, objective, soreness };
  }

  async function handleVoiceNextAction(actionId) {
    if (actionId === "generate") {
      const payload = buildVoicePlannerPayload();
      await generateWorkoutPlan(payload);
      setVoiceResponse("Plan generated from your voice selections and transcript.");
      setVoiceFlowStep("actions");
      return;
    }
    if (actionId === "duration") {
      setVoiceFlowStep("duration");
      setVoiceResponse("Select your workout duration.");
      return;
    }
    if (actionId === "type") {
      setVoiceFlowStep("type");
      setVoiceResponse("Select your workout type.");
      return;
    }
    if (actionId === "intensity") {
      setVoiceFlowStep("intensity");
      setVoiceResponse("Select your intensity goal.");
    }
  }

  function selectVoiceDuration(minutes) {
    setPlanMinutes(String(minutes));
    setVoiceFlowSelections((prev) => ({ ...prev, duration: `${minutes} min` }));
    setVoiceFlowStep("actions");
    setVoiceResponse(`Duration set to ${minutes} minutes. Choose the next step.`);
  }

  function selectVoiceType(type) {
    setPlanFocus(type);
    setVoiceFlowSelections((prev) => ({ ...prev, type }));
    setVoiceFlowStep("actions");
    setVoiceResponse(`Workout type set to ${type}. Choose the next step.`);
  }

  function selectVoiceIntensity(intensity) {
    setPlanSoreness(intensity === "Hard");
    setVoiceFlowSelections((prev) => ({ ...prev, intensity }));
    setVoiceFlowStep("actions");
    setVoiceResponse(`Intensity set to ${intensity}. Choose the next step.`);
  }

  async function requestPlannerText(prompt) {
    const res = await fetch(AI_CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "auto",
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Planner request failed: ${text}`);
    }
    const data = await res.json();
    return String(data?.content ?? "No response.");
  }

  function openStartPlanner() {
    setStartView("planner");
    setPlannerEntryMode("menu");
    setPage("start");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  async function connectPhantom() {
    if (typeof window === "undefined") return;
    const provider = window.solana;
    if (!provider?.isPhantom) {
      setWalletError("Phantom wallet not found. Install the extension/app first.");
      return;
    }

    setWalletBusy(true);
    setWalletError("");
    try {
      const response = await provider.connect();
      const publicKey =
        typeof response?.publicKey?.toString === "function"
          ? response.publicKey.toString()
          : "";
      setWalletAddress(publicKey);
      if (auth.loggedIn) {
        setAuth((prev) => ({ ...prev, walletAddress: publicKey }));
      }
    } catch (error) {
      setWalletError(`Wallet connection failed: ${String(error)}`);
    } finally {
      setWalletBusy(false);
    }
  }

  async function disconnectPhantom() {
    if (typeof window !== "undefined" && window.solana?.isPhantom) {
      try {
        await window.solana.disconnect();
      } catch {
        // Ignore disconnect errors and still clear local state.
      }
    }
    setWalletAddress("");
    setWalletError("");
    if (auth.loggedIn) {
      setAuth((prev) => ({ ...prev, walletAddress: "" }));
    }
  }

  function logout() {
    setAuth({ loggedIn: false, name: "", walletAddress: walletAddress || "" });
    setPage("home");
  }

  async function getAiFeedback() {
    if (!activeSessionId) return;
  
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    if (!activeSession) return;
  
    setAiLoading(true);
    setAiText("");
  
    try {
      const sessionSummary = {
        name: activeSession.name,
        date: activeSession.createdAt,
        exercises: activeSession.exercises.map((x) => ({
          exercise: x.name,
          sets: x.sets,
          reps: x.reps,
          weight: x.weight,
        })),
      };

      if (aiMode !== "live") {
        setAiText(buildMockCoachFeedback(sessionSummary));
        return;
      }
  
      const prompt = `
  You are a practical strength & fitness coach.
  Give concise feedback and next-step suggestions.
  
  Workout session:
  ${JSON.stringify(sessionSummary, null, 2)}
  
  Respond in:
  1) Quick summary (1-2 lines)
  2) What to improve next session (3 bullets)
  3) Optional: form/safety reminder (1 line)
  `.trim();

      const res = await fetch(AI_CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      const content = String(data?.content ?? "No response.");
      setAiText(content);
    } catch (err) {
      const fallbackSummary = {
        name: activeSession.name,
        date: activeSession.createdAt,
        exercises: activeSession.exercises.map((x) => ({
          exercise: x.name,
          sets: x.sets,
          reps: x.reps,
          weight: x.weight,
        })),
      };
      setAiText(
        `Live GPT request failed, showing local mock feedback instead.\nError: ${String(err)}\n\n${buildMockCoachFeedback(fallbackSummary)}`
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function getAiNextStepRecommendation(exerciseOverride, options = {}) {
    const { warmupOnly = false } = options;
    if (!activeSession) return;
    const sessionDayType = getSessionDayType(activeSession.name);
    if (!activeSession.startedFromStartMenu && !sessionDayType) {
      setNextStepText(
        "What type of workout are you planning to do? Select Push Day, Pull Day, Leg Day, or Full Body Day first."
      );
      return;
    }
    const targetExercise = (exerciseOverride || exerciseName).trim();
    if (!targetExercise) {
      setNextStepText("Select an exercise first, then ask AI Next Step.");
      return;
    }

    setNextStepLoading(true);
    setNextStepText("");
    try {
      if (aiMode !== "live") {
        setNextStepText(
          warmupOnly
            ? buildMockWarmupRecommendation({
                activeSession,
                targetExercise,
                sessions,
              })
            : buildMockNextStepRecommendation({
                activeSession,
                targetExercise,
                sessions,
              })
        );
        return;
      }

      const history = sessions
        .flatMap((session) =>
          (session.exercises ?? []).map((exercise) => ({
            session: session.name,
            date: exercise.createdAt,
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            weight: exercise.weight,
          }))
        )
        .filter((item) => item.name.trim().toLowerCase() === targetExercise.toLowerCase())
        .slice(-8);

      const prompt = `
You are a hypertrophy strength coach.
Recommend the immediate next step for this workout.
User wants guidance on warm-up weight and working-set progression.

Context:
- Active session: ${activeSession.name}
- Target lift: ${targetExercise}
- Current session exercises: ${JSON.stringify(activeSession.exercises ?? [], null, 2)}
- Recent logs for target lift: ${JSON.stringify(history, null, 2)}

Return format:
${warmupOnly
  ? "1) Warm-up ramp only (2-4 sets with exact weights/reps/rest)\n2) Technique cue (1 short line)\n3) Stop rule (when to reduce weight)"
  : "1) Warm-up ramp (2-3 sets with exact weights/reps)\n2) Working progression (3-4 sets with exact weights/reps/rest)\n3) Technique cue (1 short line)\n4) Stop rule (when to reduce weight)"}
      `.trim();

      const res = await fetch(AI_CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      const content = String(data?.content ?? "No response.");
      setNextStepText(content);
    } catch (error) {
      setNextStepText(
        `Live recommendation failed, showing local mock recommendation.\nError: ${String(
          error
        )}\n\n${
          warmupOnly
            ? buildMockWarmupRecommendation({
                activeSession,
                targetExercise,
                sessions,
              })
            : buildMockNextStepRecommendation({
                activeSession,
                targetExercise,
                sessions,
              })
        }`
      );
    } finally {
      setNextStepLoading(false);
    }
  }

  async function generateWorkoutPlan(overrides = null) {
    const payload = {
      minutes: Number(overrides?.minutes ?? planMinutes) || 45,
      focus: String(overrides?.focus ?? planFocus).trim() || "chest",
      objective: String(overrides?.objective ?? planObjective).trim(),
      soreness:
        typeof overrides?.soreness === "boolean" ? overrides.soreness : Boolean(planSoreness),
    };

    setPlanMinutes(String(payload.minutes));
    setPlanFocus(payload.focus);
    setPlanObjective(payload.objective);
    setPlanSoreness(payload.soreness);

    setPlanLoading(true);
    setPlanText("");
    setPlanChanges("");
    setShowPlanChanges(false);
    setRevisedPlanText("");

    try {
      if (aiMode !== "live") {
        setPlanText(buildMockWorkoutPlan(payload));
        return;
      }

      const prompt = `
You are an expert hypertrophy coach.
Create a practical gym workout plan that matches the user constraints.
Prioritize muscle growth, safety, and clear timing.

User constraints:
- Session length: ${payload.minutes} minutes
- Focus muscle: ${payload.focus}
- Goal: ${payload.objective || "Muscle growth"}
- Wants to be sore tomorrow: ${payload.soreness ? "yes" : "no"}

Format response exactly as:
1) Session structure with timestamps
2) Exercises with sets x reps x rest
3) Intensity techniques (if useful)
4) Quick coaching cues (3 bullets)
5) Next-session progression rule (2 bullets)
      `.trim();
      const content = await requestPlannerText(prompt);
      setPlanText(content);
    } catch (error) {
      setPlanText(
        `Live planner failed, showing local mock plan instead.\nError: ${String(error)}\n\n${buildMockWorkoutPlan(
          payload
        )}`
      );
    } finally {
      setPlanLoading(false);
    }
  }

  async function applyPlanChanges() {
    if (!planText || !planChanges.trim()) return;
    setPlanRevisionLoading(true);
    setRevisedPlanText("");
    try {
      if (aiMode !== "live") {
        setRevisedPlanText(
          buildMockPlanRevision({
            basePlanText: planText,
            changeRequest: planChanges.trim(),
          })
        );
        return;
      }

      const prompt = `
You are an expert hypertrophy coach.
Revise the existing workout plan according to the requested changes.
Keep the same general time budget and training goal unless told otherwise.

Existing plan:
${planText}

Requested changes:
${planChanges.trim()}

Return format:
1) Revised session structure
2) Revised exercises with sets x reps x rest
3) What changed and why (3 bullets)
      `.trim();
      const content = await requestPlannerText(prompt);
      setRevisedPlanText(content);
    } catch (error) {
      setRevisedPlanText(
        `Live revision failed, showing local mock revision.\nError: ${String(error)}\n\n${buildMockPlanRevision(
          {
            basePlanText: planText,
            changeRequest: planChanges.trim(),
          }
        )}`
      );
    } finally {
      setPlanRevisionLoading(false);
    }
  }

  function backToPlannerInputs() {
    setPlanText("");
    setShowPlanChanges(false);
    setRevisedPlanText("");
  }
  

  if (!auth.loggedIn) {
    return (
      <main className="min-h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="relative mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-8">
          <div className="pointer-events-none absolute inset-0 opacity-80">
            <div className="absolute -top-20 left-[-30%] h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="absolute -bottom-24 right-[-20%] h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
          </div>

          <section className="relative w-full rounded-[2rem] border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Fitness App</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight">
              Train smarter,
              <br />
              track every set.
            </h1>
            <p className="mt-3 text-sm text-zinc-300">
              Your sessions stay private on this device.
            </p>
            <button
              type="button"
              onClick={enterApp}
              className="mt-6 min-h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:brightness-105"
            >
              Enter App
            </button>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-300">
                  {walletAddress
                    ? `Wallet: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
                    : "No wallet connected"}
                </p>
                {walletAddress ? (
                  <button
                    type="button"
                    onClick={disconnectPhantom}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectPhantom}
                    disabled={walletBusy}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-50"
                  >
                    {walletBusy ? "Connecting..." : "Connect Phantom"}
                  </button>
                )}
              </div>
              {walletError ? (
                <p className="mt-2 text-xs text-rose-300">{walletError}</p>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="min-h-10 min-w-10 rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 hover:bg-zinc-900"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="app-menu"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ☰
                </span>
              </button>
              {menuOpen ? (
                <div
                  id="app-menu"
                  className="absolute left-0 z-20 mt-2 w-44 rounded-xl border border-zinc-700 bg-zinc-950 p-1 shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => setPage("user")}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    User Page
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage("settings")}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">J FIT 🔥</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {auth.walletAddress ? (
              <button
                type="button"
                onClick={disconnectPhantom}
                className="min-h-10 whitespace-nowrap rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              >
                Disconnect Wallet
              </button>
            ) : (
              <button
                type="button"
                onClick={connectPhantom}
                disabled={walletBusy}
                className="min-h-10 whitespace-nowrap rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
              >
                {walletBusy ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </header>

        <nav className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
          <button
            type="button"
            onClick={goToStartQuick}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "start"
                ? "bg-emerald-500 text-black"
                : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
            ].join(" ")}
          >
            Start
          </button>
          <button
            type="button"
            onClick={goToLogFromHeader}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "log" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Log
          </button>
          <button
            type="button"
            onClick={() => setPage("dashboard")}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "dashboard" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Dashboard
          </button>
        </nav>

        {page === "home" ? (
          <section className="grid gap-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h2 className="text-xl font-semibold">How do you want to proceed?</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setPage("log")}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                >
                  <p className="text-base font-semibold">Log Workout</p>
                </button>
                <button
                  type="button"
                  onClick={goToStartQuick}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                >
                  <p className="text-base font-semibold">Start Workout</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPage("dashboard")}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                >
                  <p className="text-base font-semibold">Dashboard</p>
                </button>
              </div>
            </article>
          </section>
        ) : page === "log" ? (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                <h2 className="text-xl font-semibold">Exercise Log</h2>
                {activeSession?.fromPlan ? (
                  <div className="mt-4 grid gap-4">
                    {activeSession.complete ? (
                      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-6 text-center">
                        <p className="text-sm uppercase tracking-[0.18em] text-emerald-300">Workout Finished</p>
                        <h3 className="mt-2 text-2xl font-semibold text-emerald-100">Congratulations</h3>
                        <p className="mt-2 text-sm text-emerald-200/90">
                          You completed the full suggested workout.
                        </p>
                        <button
                          type="button"
                          onClick={() => setPage("dashboard")}
                          className="mt-5 min-h-10 rounded-xl border border-emerald-300/40 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20"
                        >
                          View Results
                        </button>
                      </div>
                    ) : activeSession.exercises.length === 0 ? (
                      <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
                        No suggested exercises were found in this plan.
                      </p>
                    ) : (
                      (() => {
                        const plannedExercises = activeSession.exercises ?? [];
                        const currentExerciseIndex = plannedExercises.findIndex(
                          (exercise) => !exercise.completed
                        );
                        const safeIndex =
                          currentExerciseIndex === -1
                            ? Math.max(plannedExercises.length - 1, 0)
                            : currentExerciseIndex;
                        const currentExercise = plannedExercises[safeIndex] ?? null;
                        const completedExerciseCount = plannedExercises.filter(
                          (exercise) => exercise.completed
                        ).length;
                        const allExercisesComplete =
                          plannedExercises.length > 0 &&
                          plannedExercises.every((exercise) => exercise.completed);

                        if (!currentExercise) return null;

                        return (
                          <>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                              <p className="text-sm font-medium text-zinc-200">Guided Workout Flow</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                Complete each set, then complete the exercise to unlock the next one.
                              </p>
                              <p className="mt-2 text-xs text-zinc-400">
                                Progress: {completedExerciseCount}/{plannedExercises.length} exercises completed
                              </p>
                            </div>

                            <article className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4">
                              <p className="text-xs text-zinc-500">
                                Exercise {safeIndex + 1} of {plannedExercises.length}
                              </p>
                              <h3 className="mt-1 text-xl font-semibold">{currentExercise.name}</h3>
                              <p className="mt-1 text-sm text-zinc-300">
                                Target: {currentExercise.sets} sets
                                {Number(currentExercise.weight) > 0
                                  ? ` @ ${currentExercise.weight} lb`
                                  : ""}
                              </p>
                              {(() => {
                                const totalSets = Number(currentExercise.sets) || 0;
                                const completedSets = Number(currentExercise.completedSets) || 0;
                                const nextSet = completedSets + 1;
                                const nextStepName =
                                  Array.isArray(currentExercise.warmupSteps) &&
                                  currentExercise.warmupSteps[nextSet - 1]
                                    ? currentExercise.warmupSteps[nextSet - 1]
                                    : currentExercise.name;
                                const nextLabel =
                                  Array.isArray(currentExercise.warmupSteps) &&
                                  currentExercise.warmupSteps[nextSet - 1]
                                    ? nextStepName
                                    : `${nextStepName} x ${currentExercise.reps}`;
                                return (
                                  <div className="mt-4 grid gap-2">
                                    {Array.from({ length: completedSets }).map((_, i) => {
                                      const setNum = i + 1;
                                      const stepName =
                                        Array.isArray(currentExercise.warmupSteps) &&
                                        currentExercise.warmupSteps[setNum - 1]
                                          ? currentExercise.warmupSteps[setNum - 1]
                                          : currentExercise.name;
                                      const doneLabel =
                                        Array.isArray(currentExercise.warmupSteps) &&
                                        currentExercise.warmupSteps[setNum - 1]
                                          ? stepName
                                          : `${stepName} x ${currentExercise.reps}`;
                                      return (
                                        <div
                                          key={`${currentExercise.id}-done-${setNum}`}
                                          className="min-h-10 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                                        >
                                          Set {setNum} of {doneLabel} - complete
                                        </div>
                                      );
                                    })}

                                    {nextSet <= totalSets ? (
                                      <button
                                        type="button"
                                        onClick={() => completePlannedSet(currentExercise.id)}
                                        className="min-h-11 rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                                      >
                                        Complete set {nextSet} of {nextLabel}
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })()}

                              <button
                                type="button"
                                onClick={() => completePlannedExercise(currentExercise.id)}
                                disabled={
                                  currentExercise.completed ||
                                  (Number(currentExercise.completedSets) || 0) < (Number(currentExercise.sets) || 0)
                                }
                                className="mt-4 min-h-11 w-full rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:opacity-40"
                              >
                                {allExercisesComplete
                                  ? "Exercise Complete - Ready to Finish Workout"
                                  : "Complete Exercise"}
                              </button>
                            </article>

                            {allExercisesComplete ? (
                              <button
                                type="button"
                                onClick={completePlannedWorkout}
                                className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
                              >
                                Complete Workout
                              </button>
                            ) : null}
                          </>
                        );
                      })()
                    )}
                  </div>
                ) : (
                  <>
                {activeSession ? (
                  <div
                    className={[
                      "mt-4 grid gap-3",
                      activeSession.startedFromStartMenu
                        ? "lg:grid-cols-1"
                        : "lg:grid-cols-[1.2fr_0.8fr]",
                    ].join(" ")}
                  >
                    {!activeSession.startedFromStartMenu ? (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-sm font-medium text-zinc-200">Workout Type</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {["Push Day", "Pull Day", "Leg Day", "Full Body Day"]
                            .filter((day) => day.toLowerCase() !== (activeSession?.name || "").toLowerCase())
                            .map((day) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => startWorkoutNow(day)}
                                className="min-h-9 rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
                              >
                                {day}
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-200">AI Next Step</p>
                        <button
                          type="button"
                          onClick={() => getAiNextStepRecommendation()}
                          disabled={nextStepLoading}
                          className="min-h-8 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50"
                        >
                          {nextStepLoading ? "Thinking..." : "Recommend"}
                        </button>
                      </div>
                      {nextStepText ? (
                        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-xs text-zinc-200">
                          {nextStepText}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                ) : null}
            <form onSubmit={addExercise} className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">
                  {logExerciseStage === "day" ? "Exercise" : "Selection Exercise"}
                </span>
                {logExerciseStage === "day" ? (
                  <select
                    value={exerciseOptions.includes(exerciseName) ? exerciseName : ""}
                    onChange={(event) => handleExerciseNameChange(event.target.value)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
                  >
                    <option value="" disabled>
                      Select Exercise Type
                    </option>
                    {exerciseOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      list="exercise-options"
                      type="text"
                      value={exerciseName}
                      onChange={(event) => handleExerciseNameChange(event.target.value)}
                      placeholder="Type or select exercise"
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
                    />
                    <datalist id="exercise-options">
                      {exerciseOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </>
                )}
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Sets</span>
                  <input
                    type="number"
                    min="1"
                    value={sets}
                    onChange={(event) => setSets(event.target.value)}
                    disabled={!activeSession}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Reps</span>
                  <input
                    type="number"
                    min="1"
                    value={reps}
                    onChange={(event) => setReps(event.target.value)}
                    disabled={!activeSession}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Weight (lbs)</span>
                  <input
                    type="number"
                    min="0"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    disabled={!activeSession}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={!canAddExercise}
                className="min-h-11 rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add Exercise
              </button>
            </form>

            <div className="mt-6">
              <h3 className="text-lg font-semibold">Current Session Exercises</h3>
              {!activeSession ? (
                <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
                  Pick a session to start logging.
                </p>
              ) : activeSession.exercises.length === 0 ? (
                <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
                  No exercises yet.
                </p>
              ) : (
                
                <ul className="mt-3 grid gap-3">
                  {activeSession.exercises.map((exercise) => (
                    <li key={exercise.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-lg font-semibold">{exercise.name}</p>
                          <p className="mt-1 text-zinc-300">
                            {exercise.sets} sets x {exercise.reps} reps @ {exercise.weight} lb
                          </p>
                          <p className="mt-2 text-xs text-zinc-500">
                            {new Date(exercise.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExercise(activeSession.id, exercise.id)}
                          className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {activeSession ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSessionComplete(activeSession.id)}
                    className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
                  >
                    {activeSession.complete ? "Mark In Progress" : "Mark Complete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSession(activeSession.id)}
                    className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
                  >
                    Delete Session
                  </button>
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">AI Coach</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Mode: {aiMode === "live" ? "Live GPT (uses tokens)" : "Mock Test (no tokens)"}
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setAiMode((prev) => (prev === "live" ? "mock" : "live"))}
                      className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
                    >
                      Switch to {aiMode === "live" ? "Mock" : "Live"}
                    </button>
                    <button
                      type="button"
                      onClick={getAiFeedback}
                      disabled={!activeSession || activeSession.exercises.length === 0 || aiLoading}
                      className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {aiLoading ? "Thinking..." : "Get Feedback"}
                    </button>
                  </div>
                </div>

                {aiText ? (
                  <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-100">
                    {aiText}
                  </pre>
                ) : null}
              </div>
            </div>
            </>
            )}
            </section>
          </>
        ) : page === "start" ? (
          <section className="grid gap-6">
            {startView === "quick" ? (
              <>
                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                <h2 className="text-xl font-semibold">Start Workout</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {["Push Day", "Pull Day", "Leg Day", "Full Body Day"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => startWorkoutNow(preset, { startedFromStartMenu: true })}
                        className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                      >
                        Start {preset}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={openStartPlanner}
                    className="mt-4 min-h-11 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black sm:w-auto"
                  >
                    AI Workout Planner
                  </button>
                </article>

              </>
            ) : (
              <>
                {!planText ? (
                  <>
                {plannerEntryMode === "menu" ? (
                  <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <h2 className="text-xl font-semibold">AI Workout Planner</h2>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPlannerEntryMode("voice")}
                        className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
                      >
                        Describe with Voice
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlannerEntryMode("manual");
                          setManualTypeSelected(false);
                          setManualDurationSelected(false);
                          setManualIntensitySelected(false);
                          setManualIntensityChoice("");
                          setManualGoalEnabled(false);
                          setPlanObjective("");
                        }}
                        className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
                      >
                        Manually Select
                      </button>
                    </div>
                  </article>
                ) : null}

                {plannerEntryMode === "voice" ? (
                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Mistral Voice Coach</h3>
                    </div>
                    <button
                      type="button"
                      onClick={startVoiceCapture}
                      disabled={!voiceSupported || voiceLoading}
                      className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {voiceListening ? "Stop Recording" : "Record Workout Request"}
                    </button>
                  </div>
                  {!voiceSupported ? (
                    <p className="mt-3 text-xs text-rose-300">
                      Microphone recording is not supported in this browser.
                    </p>
                  ) : null}
                  {voiceListening ? (
                    <p className="mt-3 text-xs text-zinc-400">
                      Recording... tap stop when done.
                    </p>
                  ) : null}
                  {voiceTranscript ? (
                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200">
                      {voiceTranscript}
                    </div>
                  ) : null}
                  {voiceResponse ? (
                    <>
                      <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-100">
                        {voiceResponse}
                      </pre>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                        {voiceFlowSelections.duration ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">
                            {voiceFlowSelections.duration}
                          </span>
                        ) : null}
                        {voiceFlowSelections.type ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">
                            {voiceFlowSelections.type}
                          </span>
                        ) : null}
                        {voiceFlowSelections.intensity ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">
                            {voiceFlowSelections.intensity}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {voiceFlowStep === "actions"
                          ? [
                              { id: "generate", label: "Generate Workout Plan" },
                              ...(!voiceFlowSelections.duration
                                ? [{ id: "duration", label: "Set Workout Duration" }]
                                : []),
                              ...(!voiceFlowSelections.type
                                ? [{ id: "type", label: "Set Workout Type" }]
                                : []),
                              ...(!voiceFlowSelections.intensity
                                ? [{ id: "intensity", label: "Set Intensity Goal" }]
                                : []),
                            ].map((action) => (
                              <button
                                key={action.id}
                                type="button"
                                onClick={() => void handleVoiceNextAction(action.id)}
                                onTouchEnd={(event) => {
                                  event.preventDefault();
                                  void handleVoiceNextAction(action.id);
                                }}
                                disabled={planLoading}
                                className="min-h-10 touch-manipulation rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                              >
                                {action.label}
                              </button>
                            ))
                          : null}
                        {voiceFlowStep === "duration"
                          ? VOICE_DURATION_OPTIONS.map((minutes) => (
                              <button
                                key={`duration-${minutes}`}
                                type="button"
                                onClick={() => selectVoiceDuration(minutes)}
                                onTouchEnd={(event) => {
                                  event.preventDefault();
                                  selectVoiceDuration(minutes);
                                }}
                                className="min-h-10 touch-manipulation rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                              >
                                {minutes} min
                              </button>
                            ))
                          : null}
                        {voiceFlowStep === "type"
                          ? VOICE_TYPE_OPTIONS.map((type) => (
                              <button
                                key={`type-${type}`}
                                type="button"
                                onClick={() => selectVoiceType(type)}
                                onTouchEnd={(event) => {
                                  event.preventDefault();
                                  selectVoiceType(type);
                                }}
                                className="min-h-10 touch-manipulation rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                              >
                                {type}
                              </button>
                            ))
                          : null}
                        {voiceFlowStep === "intensity"
                          ? VOICE_INTENSITY_OPTIONS.map((intensity) => (
                              <button
                                key={`intensity-${intensity}`}
                                type="button"
                                onClick={() => selectVoiceIntensity(intensity)}
                                onTouchEnd={(event) => {
                                  event.preventDefault();
                                  selectVoiceIntensity(intensity);
                                }}
                                className="min-h-10 touch-manipulation rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                              >
                                {intensity}
                              </button>
                            ))
                          : null}
                        {voiceFlowStep !== "actions" ? (
                          <button
                            type="button"
                            onClick={() => setVoiceFlowStep("actions")}
                            onTouchEnd={(event) => {
                              event.preventDefault();
                              setVoiceFlowStep("actions");
                            }}
                            className="min-h-10 touch-manipulation rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                          >
                            Back to Actions
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </article>
                ) : null}

                {plannerEntryMode === "manual" ? (
                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">AI Workout Planner</h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        Mode: {aiMode === "live" ? "Live GPT (uses tokens)" : "Mock Test (no tokens)"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Live provider: Serverless AI API
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={goToStartQuick}
                        className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiMode((prev) => (prev === "live" ? "mock" : "live"))}
                        className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
                      >
                        Switch to {aiMode === "live" ? "Mock" : "Live"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-sm font-medium text-zinc-200">1) Select Workout Type</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {VOICE_TYPE_OPTIONS.map((type) => (
                          <button
                            key={`manual-type-${type}`}
                            type="button"
                            onClick={() => {
                              setPlanFocus(type);
                              setManualTypeSelected(true);
                            }}
                            className={[
                              "min-h-10 rounded-xl border px-3 py-2 text-sm",
                              planFocus === type && manualTypeSelected
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 text-zinc-200 hover:bg-zinc-900",
                            ].join(" ")}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-sm font-medium text-zinc-200">2) Select Duration</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-4">
                        {VOICE_DURATION_OPTIONS.map((minutes) => (
                          <button
                            key={`manual-duration-${minutes}`}
                            type="button"
                            onClick={() => {
                              setPlanMinutes(String(minutes));
                              setManualDurationSelected(true);
                            }}
                            disabled={!manualTypeSelected}
                            className={[
                              "min-h-10 rounded-xl border px-3 py-2 text-sm disabled:opacity-40",
                              Number(planMinutes) === minutes && manualDurationSelected
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 text-zinc-200 hover:bg-zinc-900",
                            ].join(" ")}
                          >
                            {minutes} min
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-sm font-medium text-zinc-200">3) Select Intensity</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {VOICE_INTENSITY_OPTIONS.map((intensity) => (
                          <button
                            key={`manual-intensity-${intensity}`}
                            type="button"
                            onClick={() => {
                              setPlanSoreness(intensity === "Hard");
                              setManualIntensitySelected(true);
                              setManualIntensityChoice(intensity);
                            }}
                            disabled={!manualTypeSelected || !manualDurationSelected}
                            className={[
                              "min-h-10 rounded-xl border px-3 py-2 text-sm disabled:opacity-40",
                              manualIntensityChoice === intensity
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 text-zinc-200 hover:bg-zinc-900",
                            ].join(" ")}
                          >
                            {intensity}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-sm font-medium text-zinc-200">4) Optional Goal</p>
                      <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          checked={manualGoalEnabled}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            setManualGoalEnabled(enabled);
                            if (!enabled) setPlanObjective("");
                          }}
                          disabled={!manualTypeSelected || !manualDurationSelected || !manualIntensitySelected}
                        />
                        Add goal details
                      </label>
                      {manualGoalEnabled ? (
                        <textarea
                          value={planObjective}
                          onChange={(event) => setPlanObjective(event.target.value)}
                          rows={3}
                          placeholder="Optional: describe your workout goal"
                          disabled={!manualTypeSelected || !manualDurationSelected || !manualIntensitySelected}
                          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-40"
                        />
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={generateWorkoutPlan}
                      disabled={
                        planLoading ||
                        !manualTypeSelected ||
                        !manualDurationSelected ||
                        !manualIntensitySelected
                      }
                      className="min-h-11 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {planLoading ? "Planning..." : "Generate Workout Plan"}
                    </button>
                  </div>
                </article>
                ) : null}
                  </>
                ) : null}

                {planText ? (
                  <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={backToPlannerInputs}
                        onTouchEnd={(event) => {
                          event.preventDefault();
                          backToPlannerInputs();
                        }}
                        className="min-h-10 touch-manipulation rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                      >
                        Back to Planner
                      </button>
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-200">
                        {Number(planMinutes) || 45} min
                      </span>
                      <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-200">
                        Focus: {planFocus || "Chest"}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-200">
                        {planSoreness ? "High Stimulus" : "Moderate Stimulus"}
                      </span>
                    </div>

                    <div className="grid gap-3">
                      {planSections.map((section) => (
                        <section key={section.title} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                          <h3 className="text-base font-semibold text-zinc-100">{section.title}</h3>
                          <ul className="mt-2 grid gap-2 text-sm text-zinc-300">
                            {section.items.map((item) => (
                              <li key={`${section.title}-${item}`} className="rounded-lg bg-zinc-900/70 px-3 py-2">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={beginWorkoutFromPlan}
                        onTouchEnd={(event) => {
                          event.preventDefault();
                          beginWorkoutFromPlan();
                        }}
                        className="min-h-11 touch-manipulation rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
                      >
                        Begin Workout
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPlanChanges((prev) => !prev)}
                        className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
                      >
                        Add Changes
                      </button>
                    </div>

                    {showPlanChanges ? (
                      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                        <label className="grid gap-2">
                          <span className="text-sm text-zinc-300">Describe changes to make</span>
                          <textarea
                            value={planChanges}
                            onChange={(event) => setPlanChanges(event.target.value)}
                            rows={3}
                            placeholder="Example: reduce total sets, add more incline work, avoid barbell bench."
                            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-white/20"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={applyPlanChanges}
                          disabled={!planChanges.trim() || planRevisionLoading}
                          className="mt-3 min-h-10 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                        >
                          {planRevisionLoading ? "Updating..." : "Apply Changes"}
                        </button>
                      </div>
                    ) : null}

                    {revisedPlanText ? (
                      <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
                        <p className="text-sm font-semibold text-zinc-100">Revised Plan</p>
                        <div className="mt-3 grid gap-3">
                          {revisedPlanSections.map((section) => (
                            <section key={`revised-${section.title}`} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                              <h3 className="text-base font-semibold text-zinc-100">{section.title}</h3>
                              <ul className="mt-2 grid gap-2 text-sm text-zinc-300">
                                {section.items.map((item) => (
                                  <li key={`revised-${section.title}-${item}`} className="rounded-lg bg-zinc-900/70 px-3 py-2">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </section>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ) : null}
              </>
            )}
          </section>
        ) : page === "dashboard" ? (
          <section className="grid gap-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h2 className="text-xl font-semibold">Dashboard Home</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPage("log")}
                  className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  Go to Log
                </button>
                <button
                  type="button"
                  onClick={goToStartQuick}
                  className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  Start a Workout
                </button>
              </div>
            </article>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <p className="mb-3 text-sm text-zinc-400">Time Range</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "7d", label: "7D" },
                  { value: "30d", label: "30D" },
                  { value: "90d", label: "90D" },
                  { value: "all", label: "All" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setChartRange(option.value)}
                    className={[
                      "min-h-10 rounded-xl px-2 py-2 text-sm font-medium",
                      chartRange === option.value
                        ? "bg-white text-black"
                        : "bg-zinc-950 text-zinc-300",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Completion Rate</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {progress.completionRate.toFixed(0)}%
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Avg Session Volume</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {Math.round(progress.avgVolume).toLocaleString()} lb
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Best Session</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {progress.maxVolume.toLocaleString()} lb
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Tracked Sessions</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {progress.filteredSessionCount}
                </p>
              </article>
            </div>

            {progress.points.length === 0 ? (
              <p className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 text-zinc-300">
                No chart data in this time range yet.
              </p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <h2 className="text-lg font-semibold">Session Volume History</h2>
                  <div className="mt-4 flex h-52 items-end gap-2">
                    {progress.points.map((point) => {
                      const height = Math.max((point.volume / progress.maxVolume) * 100, 4);
                      return (
                        <div key={point.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="text-[10px] text-zinc-500">{point.volume.toLocaleString()}</div>
                          <div
                            className="w-full rounded-t-md bg-white/80"
                            style={{ height: `${height}%` }}
                            title={`${point.name}: ${point.volume.toLocaleString()} lb`}
                          />
                          <div className="text-[10px] text-zinc-400">{formatDate(point.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <h2 className="text-lg font-semibold">Cumulative Volume Trend</h2>
                  <svg viewBox="0 0 100 40" className="mt-4 h-52 w-full rounded-xl bg-zinc-950 p-2">
                    {(() => {
                      const maxY = Math.max(
                        ...progress.cumulative.map((point) => point.value),
                        1
                      );
                      const points = progress.cumulative
                        .map((point, index) => {
                          const x =
                            progress.cumulative.length === 1
                              ? 0
                              : (index / (progress.cumulative.length - 1)) * 100;
                          const y = 38 - (point.value / maxY) * 34;
                          return `${x},${y}`;
                        })
                        .join(" ");
                      return (
                        <>
                          <polyline fill="none" stroke="rgb(82 82 91)" strokeWidth="0.7" points="0,38 100,38" />
                          <polyline
                            fill="none"
                            stroke="rgb(244 244 245)"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points}
                          />
                        </>
                      );
                    })()}
                  </svg>
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 lg:col-span-2">
                  <h2 className="text-lg font-semibold">Top Exercises by Volume</h2>
                  <div className="mt-4 grid gap-3">
                    {progress.topExercises.length === 0 ? (
                      <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
                        No exercise data yet.
                      </p>
                    ) : (
                      progress.topExercises.map((exercise) => {
                        const width = Math.max(
                          (exercise.volume / progress.topExerciseMax) * 100,
                          8
                        );
                        return (
                          <div key={exercise.name} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="min-w-0 truncate font-medium">{exercise.name}</p>
                              <p className="text-sm text-zinc-300">
                                {exercise.volume.toLocaleString()} lb
                              </p>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-zinc-800">
                              <div className="h-2 rounded-full bg-white" style={{ width: `${width}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">{exercise.count} entries logged</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
            )}
          </section>
        ) : page === "user" ? (
          <section className="grid gap-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h2 className="text-xl font-semibold">User Page</h2>
              <div className="mt-4 grid gap-2 text-sm text-zinc-300">
                <p>Display Name: {auth.name || "Athlete"}</p>
                <p>
                  Wallet: {auth.walletAddress
                    ? `${auth.walletAddress.slice(0, 6)}...${auth.walletAddress.slice(-6)}`
                    : "Not connected"}
                </p>
                <p>Total Sessions: {totals.sessions}</p>
              </div>
            </article>
          </section>
        ) : page === "settings" ? (
          <section className="grid gap-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h2 className="text-xl font-semibold">Settings</h2>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => setAiMode((prev) => (prev === "live" ? "mock" : "live"))}
                  className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                >
                  AI Mode: {aiMode === "live" ? "Live" : "Mock"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEY);
                    setSessions([]);
                    setActiveSessionId(null);
                  }}
                  className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                >
                  Clear Workout Data
                </button>
              </div>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}
