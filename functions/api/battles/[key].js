function parseBattleRow(row) {
  return {
    key: row.key,
    title: row.title,
    config: JSON.parse(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
      return activeNames.join(", ") || "Kosmiczna bitwa";
    }

    if (activeNames.length > 3) {
      return `${activeNames.slice(0, 3).join(", ")} +${activeNames.length - 3}`;
    }
  }

  return "Kosmiczna bitwa";
}

export async function onRequestGet(context) {
  try {
    const key = context.params.key;
    const row = await context.env.DB.prepare(
      `SELECT key, title, config_json, created_at, updated_at
       FROM battles
       WHERE key = ?1`
    )
      .bind(key)
      .first();

    if (!row) {
      return Response.json(
        { success: false, error: "Battle not found." },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      battle: parseBattleRow(row),
    });
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

export async function onRequestPut(context) {
  try {
    const key = context.params.key;
    const body = await context.request.json();
    const config = body?.config;

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return Response.json(
        { success: false, error: "Body must contain a config object." },
        { status: 400 }
      );
    }

    const existingBattle = await context.env.DB.prepare(
      "SELECT key, created_at FROM battles WHERE key = ?1"
    )
      .bind(key)
      .first();

    if (!existingBattle) {
      return Response.json(
        { success: false, error: "Battle not found." },
        { status: 404 }
      );
    }

    const now = Date.now();
    const title = normalizeTitle(body?.title, config);
    const configJson = JSON.stringify(config);

    await context.env.DB.prepare(
      `UPDATE battles
       SET title = ?2,
           config_json = ?3,
           updated_at = ?4
       WHERE key = ?1`
    )
      .bind(key, title, configJson, now)
      .run();

    return Response.json({
      success: true,
      battle: {
        key,
        title,
        config,
        createdAt: existingBattle.created_at,
        updatedAt: now,
      },
    });
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
