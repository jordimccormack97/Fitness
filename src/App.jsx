import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "fitness_app_sessions_v2";
const AUTH_KEY = "fitness_app_auth_v1";
const USERS_KEY = "fitness_app_users_v1";
const AI_MODE_KEY = "fitness_app_ai_mode_v1";

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

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
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
    ? `${topExercise.exercise} (${topExercise.sets}x${topExercise.reps} @ ${topExercise.weight} kg)`
    : "No top movement yet.";
  const avgSets = exercises.length ? (totalSets / exercises.length).toFixed(1) : "0.0";

  return [
    "1) Quick summary",
    `Solid ${sessionSummary.name} session: ${exercises.length} exercises, ${totalSets} sets, ${totalVolume.toLocaleString()} kg total volume.`,
    `Top lift today: ${topExerciseText}`,
    "",
    "2) What to improve next session",
    `- Progress one anchor lift by +1 rep or +2.5 kg while keeping form strict.`,
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

export default function App() {
  const initialAiMode = import.meta.env.VITE_AI_MODE === "live" ? "live" : "mock";
  const [auth, setAuth] = useState(() => loadAuth());
  const [users, setUsers] = useState(() => loadUsers());
  const [authMode, setAuthMode] = useState("signin");
  const [displayName, setDisplayName] = useState(() => loadAuth().name || "");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [walletAddress, setWalletAddress] = useState(() => loadAuth().walletAddress || "");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [sessions, setSessions] = useState(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [exerciseName, setExerciseName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("0");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [planMinutes, setPlanMinutes] = useState("45");
  const [planFocus, setPlanFocus] = useState("Chest");
  const [planObjective, setPlanObjective] = useState(
    "Make me sore tomorrow and focused on getting a bigger chest."
  );
  const [planSoreness, setPlanSoreness] = useState(true);
  const [planText, setPlanText] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [aiMode, setAiMode] = useState(() => localStorage.getItem(AI_MODE_KEY) || initialAiMode);
  const [page, setPage] = useState("home");
  const [chartRange, setChartRange] = useState("90d");



  useEffect(() => {
    saveAuth(auth);
  }, [auth]);

  useEffect(() => {
    saveUsers(users);
  }, [users]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(AI_MODE_KEY, aiMode);
  }, [aiMode]);

  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSessionId(null);
      return;
    }
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

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

  const canLogin = displayName.trim().length >= 2 && password.trim().length >= 4;
  const canCreateAccount = displayName.trim().length >= 2 && password.trim().length >= 6;
  const canAddExercise =
    activeSession &&
    exerciseName.trim().length > 0 &&
    Number(sets) > 0 &&
    Number(reps) > 0 &&
    Number(weight) >= 0;

  function startWorkoutNow(workoutName) {
    const name = workoutName?.trim() || "Workout";
    const created = {
      id: crypto.randomUUID(),
      name,
      complete: false,
      createdAt: new Date().toISOString(),
      exercises: [],
    };
    setSessions((prev) => [created, ...prev]);
    setActiveSessionId(created.id);
    setPage("log");
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
      id: crypto.randomUUID(),
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

  function login(event) {
    event.preventDefault();
    if (!canLogin) {
      setAuthError("Use at least 2 characters for name and 4 for password.");
      return;
    }
    const normalizedName = displayName.trim().toLowerCase();
    const found = users.find((user) => user.name.toLowerCase() === normalizedName);
    if (!found || found.password !== password) {
      setAuthError("Invalid name or password.");
      return;
    }
    setAuth({ loggedIn: true, name: found.name, walletAddress });
    setPage("home");
    setPassword("");
    setAuthError("");
  }

  function createAccount(event) {
    event.preventDefault();
    if (!canCreateAccount) {
      setAuthError("Create account needs 2+ char name and 6+ char password.");
      return;
    }

    const trimmedName = displayName.trim();
    const normalizedName = trimmedName.toLowerCase();
    const exists = users.some((user) => user.name.toLowerCase() === normalizedName);
    if (exists) {
      setAuthError("That name already exists. Sign in or choose another.");
      return;
    }

    const nextUser = {
      id: crypto.randomUUID(),
      name: trimmedName,
      password,
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [nextUser, ...prev]);
    setAuth({ loggedIn: true, name: trimmedName, walletAddress });
    setPage("home");
    setPassword("");
    setAuthError("");
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
    setPassword("");
    setAuthError("");
  }

  async function getAiFeedback() {
    if (!activeSessionId) return;
  
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    if (!activeSession) return;
  
    setAiLoading(true);
    setAiText("");
  
    try {
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  
      if (!apiKey) {
        throw new Error(
          "Missing VITE_OPENROUTER_API_KEY. Add it to .env.local and restart the dev server."
        );
      }
  
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
  
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
  
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "No response.";
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

  async function generateWorkoutPlan() {
    setPlanLoading(true);
    setPlanText("");

    const payload = {
      minutes: Number(planMinutes) || 45,
      focus: planFocus.trim() || "chest",
      objective: planObjective.trim(),
      soreness: planSoreness,
    };

    try {
      if (aiMode !== "live") {
        setPlanText(buildMockWorkoutPlan(payload));
        return;
      }

      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Missing VITE_OPENROUTER_API_KEY. Add it to .env.local and restart the dev server."
        );
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

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "No response.";
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
              Your sessions stay private on this device. Sign in or create an account.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthError("");
                }}
                className={[
                  "min-h-11 rounded-xl text-sm font-medium",
                  authMode === "signin" ? "bg-white text-black" : "text-zinc-300",
                ].join(" ")}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("create");
                  setAuthError("");
                }}
                className={[
                  "min-h-11 rounded-xl text-sm font-medium",
                  authMode === "create" ? "bg-white text-black" : "text-zinc-300",
                ].join(" ")}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={authMode === "create" ? createAccount : login} className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Alex"
                  className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-950/70 px-4 py-3 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-950/70 px-4 py-3 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                />
              </label>

              {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}

              <button
                type="submit"
                disabled={authMode === "create" ? !canCreateAccount : !canLogin}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {authMode === "create" ? "Create & Enter" : "Enter App"}
              </button>
            </form>

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
              ) : (
                <p className="mt-2 text-xs text-zinc-400">
                  Phantom connection is optional and links your wallet to this local profile.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Workout App</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-300 sm:text-base">
              Welcome back, {auth.name || "Athlete"}.
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {auth.walletAddress
                ? `Phantom ${auth.walletAddress.slice(0, 4)}...${auth.walletAddress.slice(-4)}`
                : "Phantom not connected"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {auth.walletAddress ? (
              <button
                type="button"
                onClick={disconnectPhantom}
                className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              >
                Disconnect Wallet
              </button>
            ) : (
              <button
                type="button"
                onClick={connectPhantom}
                disabled={walletBusy}
                className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
              >
                {walletBusy ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Log out
            </button>
          </div>
        </header>

        <nav className="mb-6 grid grid-cols-4 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
          <button
            type="button"
            onClick={() => setPage("home")}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "home" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => setPage("log")}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "log" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Log
          </button>
          <button
            type="button"
            onClick={() => setPage("start")}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "start" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Start
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
              <p className="mt-1 text-sm text-zinc-400">
                Pick a path to continue your training workflow.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setPage("log")}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                >
                  <p className="text-base font-semibold">Log Workout</p>
                  <p className="mt-1 text-sm text-zinc-400">Add sets, reps, and weights to a session.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPage("start")}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                >
                  <p className="text-base font-semibold">Start Workout</p>
                  <p className="mt-1 text-sm text-zinc-400">Create a quick session or generate a plan with AI.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPage("dashboard")}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                >
                  <p className="text-base font-semibold">Dashboard</p>
                  <p className="mt-1 text-sm text-zinc-400">Review performance and volume trends.</p>
                </button>
              </div>
            </article>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Sessions</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.sessions}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Exercises Logged</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.exercises}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Sets Completed</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.sets}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Completion Rate</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {progress.completionRate.toFixed(0)}%
                </p>
              </article>
            </section>
          </section>
        ) : page === "log" ? (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Sessions</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.sessions}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Exercises Logged</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.exercises}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Sets Completed</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.sets}</p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Total Volume</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {totals.volume.toLocaleString()} kg
                </p>
              </article>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                <h2 className="text-xl font-semibold">Exercise Log</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {activeSession ? `Adding to: ${activeSession.name}` : "Start a workout first"}
                </p>
                {activeSession ? (
                  <div className="mt-3 flex flex-wrap gap-2">
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

            <form onSubmit={addExercise} className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Exercise</span>
                <input
                  value={exerciseName}
                  onChange={(event) => setExerciseName(event.target.value)}
                  placeholder="e.g., Barbell Squat"
                  disabled={!activeSession}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                />
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
                  <span className="text-sm text-zinc-300">Weight (kg)</span>
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
              {/* AI Coach */}
<div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h3 className="text-lg font-semibold">AI Coach</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Get quick feedback on this workout session.
      </p>
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
  ) : (
    <div className="mt-4 text-sm text-zinc-400">
      {!activeSession
        ? "Select a session to enable AI feedback."
        : activeSession.exercises.length === 0
          ? "Add at least one exercise first."
          : "Click 'Get Feedback' to see coaching advice."}
    </div>
  )}
</div>

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
                            {exercise.sets} sets x {exercise.reps} reps @ {exercise.weight} kg
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
            </div>
            </section>
          </>
        ) : page === "start" ? (
          <section className="grid gap-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h2 className="text-xl font-semibold">Start Workout</h2>
              <p className="mt-1 text-sm text-zinc-400">Start instantly, then log details in the Log tab.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {["Push Day", "Pull Day", "Leg Day"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => startWorkoutNow(preset)}
                    className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    Start {preset}
                  </button>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">AI Workout Planner</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Build a custom workout from your time and goal.
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Mode: {aiMode === "live" ? "Live GPT (uses tokens)" : "Mock Test (no tokens)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAiMode((prev) => (prev === "live" ? "mock" : "live"))}
                  className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900"
                >
                  Switch to {aiMode === "live" ? "Mock" : "Live"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Minutes Available</span>
                  <input
                    type="number"
                    min="20"
                    step="5"
                    value={planMinutes}
                    onChange={(event) => setPlanMinutes(event.target.value)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Focus Muscle</span>
                  <input
                    value={planFocus}
                    onChange={(event) => setPlanFocus(event.target.value)}
                    placeholder="Chest"
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
                  />
                </label>
              </div>

              <label className="mt-3 grid gap-2">
                <span className="text-sm text-zinc-300">Goal</span>
                <textarea
                  value={planObjective}
                  onChange={(event) => setPlanObjective(event.target.value)}
                  rows={3}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
                />
              </label>

              <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={planSoreness}
                  onChange={(event) => setPlanSoreness(event.target.checked)}
                />
                Make it high stimulus (likely sore tomorrow)
              </label>

              <button
                type="button"
                onClick={generateWorkoutPlan}
                disabled={planLoading}
                className="mt-4 min-h-11 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40 sm:w-auto"
              >
                {planLoading ? "Planning..." : "Generate Workout Plan"}
              </button>
            </article>

            {!planText ? (
              <p className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 text-zinc-300">
                Example: 45 minutes, chest, and goal to build size with high soreness.
              </p>
            ) : (
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
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
              </article>
            )}
          </section>
        ) : page === "dashboard" ? (
          <section className="grid gap-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h2 className="text-xl font-semibold">Dashboard Home</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Snapshot of your consistency, volume, and recent trend.
              </p>
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
                  onClick={() => setPage("start")}
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
                  {Math.round(progress.avgVolume).toLocaleString()} kg
                </p>
              </article>
              <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-400">Best Session</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {progress.maxVolume.toLocaleString()} kg
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
                  <p className="mt-1 text-sm text-zinc-400">Last {progress.points.length} sessions</p>
                  <div className="mt-4 flex h-52 items-end gap-2">
                    {progress.points.map((point) => {
                      const height = Math.max((point.volume / progress.maxVolume) * 100, 4);
                      return (
                        <div key={point.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="text-[10px] text-zinc-500">{point.volume.toLocaleString()}</div>
                          <div
                            className="w-full rounded-t-md bg-white/80"
                            style={{ height: `${height}%` }}
                            title={`${point.name}: ${point.volume.toLocaleString()} kg`}
                          />
                          <div className="text-[10px] text-zinc-400">{formatDate(point.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <h2 className="text-lg font-semibold">Cumulative Volume Trend</h2>
                  <p className="mt-1 text-sm text-zinc-400">Running total in selected range</p>
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
                  <p className="mt-1 text-sm text-zinc-400">Highest total load in selected range</p>
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
                                {exercise.volume.toLocaleString()} kg
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
        ) : null}
      </div>
    </main>
  );
}
