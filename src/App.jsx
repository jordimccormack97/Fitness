import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "fitness_app_sessions_v2";
const AUTH_KEY = "fitness_app_auth_v1";

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
      return { loggedIn: false, name: "" };
    }
    return {
      loggedIn: Boolean(parsed.loggedIn),
      name: typeof parsed.name === "string" ? parsed.name : "",
    };
  } catch {
    return { loggedIn: false, name: "" };
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

export default function App() {
  const [auth, setAuth] = useState(() => loadAuth());
  const [displayName, setDisplayName] = useState(() => loadAuth().name || "");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [sessions, setSessions] = useState(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [search, setSearch] = useState("");
  const [sessionName, setSessionName] = useState("Push Day");
  const [exerciseName, setExerciseName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("0");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [page, setPage] = useState("workout");
  const [tab, setTab] = useState("sessions");
  const [chartRange, setChartRange] = useState("90d");



  useEffect(() => {
    saveAuth(auth);
  }, [auth]);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSessionId(null);
      return;
    }
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const visibleSessions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) => session.name.toLowerCase().includes(needle));
  }, [sessions, search]);

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

  const canCreateSession = sessionName.trim().length > 0;
  const canLogin = displayName.trim().length >= 2 && password.trim().length >= 4;
  const canAddExercise =
    activeSession &&
    exerciseName.trim().length > 0 &&
    Number(sets) > 0 &&
    Number(reps) > 0 &&
    Number(weight) >= 0;

  function createSession(event) {
    event.preventDefault();
    if (!canCreateSession) return;

    const created = {
      id: crypto.randomUUID(),
      name: sessionName.trim(),
      complete: false,
      createdAt: new Date().toISOString(),
      exercises: [],
    };

    setSessions((prev) => [created, ...prev]);
    setActiveSessionId(created.id);
    setTab("exercises");
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
    setAuth({ loggedIn: true, name: displayName.trim() });
    setPassword("");
    setAuthError("");
  }

  function logout() {
    setAuth({ loggedIn: false, name: "" });
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
      setAiText(
        `AI request failed.\n\nCommon fixes:\n- Check .env.local has VITE_OPENROUTER_API_KEY=\n- Restart bun run dev after editing env\n\nError:\n${String(err)}`
      );
    } finally {
      setAiLoading(false);
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
              Your sessions stay private on this device. Sign in to continue.
            </p>

            <form onSubmit={login} className="mt-6 grid gap-4">
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
                disabled={!canLogin}
                className="min-h-12 rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enter App
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400">
              Demo login only for now. Next step can be signup/reset/biometric flows.
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
          </div>
          <button
            type="button"
            onClick={logout}
            className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Log out
          </button>
        </header>

        <nav className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1">
          <button
            type="button"
            onClick={() => setPage("workout")}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "workout" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Workout
          </button>
          <button
            type="button"
            onClick={() => setPage("charts")}
            className={[
              "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
              page === "charts" ? "bg-white text-black" : "bg-transparent text-zinc-300",
            ].join(" ")}
          >
            Charts
          </button>
        </nav>

        {page === "workout" ? (
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

            <nav className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setTab("sessions")}
                className={[
                  "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
                  tab === "sessions" ? "bg-white text-black" : "bg-transparent text-zinc-300",
                ].join(" ")}
              >
                Sessions
              </button>
              <button
                type="button"
                onClick={() => setTab("exercises")}
                className={[
                  "min-h-11 rounded-xl px-3 py-2 text-sm font-medium",
                  tab === "exercises" ? "bg-white text-black" : "bg-transparent text-zinc-300",
                ].join(" ")}
              >
                Exercise Log
              </button>
            </nav>

            <div className="grid gap-6 lg:grid-cols-2">
              <section
                className={[
                  "rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4",
                  tab === "sessions" ? "block" : "hidden",
                  "lg:block",
                ].join(" ")}
              >
                <h2 className="text-xl font-semibold">Sessions</h2>

            <form onSubmit={createSession} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="e.g., Pull Day"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
              />
              <button
                type="submit"
                disabled={!canCreateSession}
                className="min-h-11 rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:opacity-40"
              >
                Create
              </button>
            </form>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter sessions"
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 outline-none focus:ring-2 focus:ring-white/20"
            />

            <div className="mt-4 grid gap-3">
              {visibleSessions.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
                  No sessions match your filter.
                </p>
              ) : (
                visibleSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <article
                      key={session.id}
                      className={[
                        "rounded-2xl border p-4",
                        isActive ? "border-white/30 bg-white/5" : "border-zinc-800 bg-zinc-950",
                      ].join(" ")}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setActiveSessionId(session.id);
                            setTab("exercises");
                          }}
                        >
                          <p className="break-words text-lg font-semibold">{session.name}</p>
                          <p className="mt-1 text-sm text-zinc-400">
                            {formatDate(session.createdAt)} | {session.exercises.length} exercises
                          </p>
                          <p
                            className={[
                              "mt-2 inline-block rounded-full px-2 py-1 text-xs",
                              session.complete
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-zinc-700 text-zinc-200",
                            ].join(" ")}
                          >
                            {session.complete ? "Complete" : "In Progress"}
                          </p>
                        </button>
                        <div className="flex gap-2 sm:flex-col">
                          <button
                            type="button"
                            onClick={() => toggleSessionComplete(session.id)}
                            className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
                          >
                            Toggle
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSession(session.id)}
                            className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
              </section>

              <section
                className={[
                  "rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4",
                  tab === "exercises" ? "block" : "hidden",
                  "lg:block",
                ].join(" ")}
              >
                <h2 className="text-xl font-semibold">Exercise Log</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {activeSession ? `Adding to: ${activeSession.name}` : "Select a session first"}
                </p>

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
    </div>

    <button
      type="button"
      onClick={getAiFeedback}
      disabled={!activeSession || activeSession.exercises.length === 0 || aiLoading}
      className="min-h-11 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40 sm:w-auto"
    >
      {aiLoading ? "Thinking..." : "Get Feedback"}
    </button>
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
            </div>
          </>
        ) : (
          <section className="grid gap-6">
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
        )}
      </div>
    </main>
  );
}
