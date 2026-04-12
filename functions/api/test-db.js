export async function onRequestGet(context) {
  try {
    const result = await context.env.DB.prepare("SELECT 1 AS ok").first();

    return Response.json({
      success: true,
      binding: "DB",
      result,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        binding: "DB",
        error: String(error),
      },
      { status: 500 }
    );
  }
}
