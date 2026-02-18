import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "fitness_app_sessions_v2";

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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function App() {
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
  const [tab, setTab] = useState("log");



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

  const canCreateSession = sessionName.trim().length > 0;
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
  

  return (
    <main className="min-h-dvh overflow-x-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-24 sm:px-6 sm:pt-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Workout App</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-300 sm:text-base">
            Track sessions, log lifts, and keep your progress on this device.
          </p>
        </header>

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
            <p className="mt-1 text-xl font-semibold sm:text-2xl">{totals.volume.toLocaleString()} kg</p>
          </article>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
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
                          onClick={() => setActiveSessionId(session.id)}
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

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
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
      </div>
    </main>
  );
}
