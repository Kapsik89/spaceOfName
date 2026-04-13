function createBattleKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `battle-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function normalizeBattleKey(inputKey) {
  if (typeof inputKey !== "string") return null;
  const normalizedKey = inputKey.trim().toLowerCase();
  if (!normalizedKey) return null;
  if (!/^[a-z0-9-]{6,120}$/.test(normalizedKey)) {
    return null;
  }
  return normalizedKey;
}

function normalizeTitle(title, fallbackConfig) {
  if (typeof title === "string" && title.trim()) {
    return title.trim().slice(0, 120);
  }

  const participants = fallbackConfig?.participants;
  if (Array.isArray(participants)) {
    const activeNames = participants
      .filter((participant) => participant?.active !== false)
      .map((participant) => participant?.name)
      .filter(Boolean);

    if (activeNames.length <= 3) {
      return activeNames.join(", ") || "Space battle";
    }

    if (activeNames.length > 3) {
      return `${activeNames.slice(0, 3).join(", ")} +${activeNames.length - 3}`;
    }
  }

  return "Space battle";
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const config = body?.config;

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return Response.json(
        { success: false, error: "Body must contain a config object." },
        { status: 400 }
      );
    }

    const key = normalizeBattleKey(body?.key) ?? createBattleKey();
    const now = Date.now();
    const title = normalizeTitle(body?.title, config);
    const configJson = JSON.stringify(config);

    await context.env.DB.prepare(
      `INSERT INTO battles (key, title, config_json, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
      .bind(key, title, configJson, now, now)
      .run();

    return Response.json(
      {
        success: true,
        battle: {
          key,
          title,
          config,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
