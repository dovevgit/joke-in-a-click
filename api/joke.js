// Milestone 1: פונקציה זמנית. מחזירה תשובה קבועה, ובודקת רק אם המפתח קיים.
// את המפתח עצמו היא לא מחזירה אף פעם.

const MAX_TOPIC = 100;

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "רק POST" }, { status: 405 });
    }

    let topic = "";
    try {
      const body = await request.json();
      if (typeof body?.topic === "string") topic = body.topic.trim().slice(0, MAX_TOPIC);
    } catch {
      // גוף שבור נחשב "אין נושא"
    }

    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    console.log(`joke request: topic="${topic}" key=${hasKey ? "yes" : "no"}`);

    const joke = `בדיחה זמנית מהשרת: ${topic || "בלי נושא"}. המפתח: ${hasKey ? "נמצא" : "חסר"}`;
    return Response.json({ joke });
  },
};
