// הפונקציה היחידה של האפליקציה, והמקום היחיד שקורא את המפתח של OpenAI.
// הדפדפן שולח נושא, הפונקציה מבקשת בדיחה מהמודל ומחזירה רק את הטקסט.

const MAX_TOPIC = 100;
const OPENAI_URL = "https://api.openai.com/v1/responses";

const INSTRUCTIONS =
  "אתה כותב בדיחות קצרות בעברית. כתוב בדיחה אחת בלבד, עד ארבעה משפטים, נקייה ומתאימה לכל גיל. בלי הקדמה, בלי הסבר ובלי אימוג׳י. רק הבדיחה.";

const fail = (status, error) => Response.json({ error }, { status });

// הודעה קצרה בעברית לדף, לפי הקוד שחזר מ-OpenAI. הפרטים נשארים ב-Logs.
function errorMessage(status, code) {
  if (status === 401) return "המפתח של השרת לא תקין.";
  if (code === "insufficient_quota") return "נגמר הקרדיט או שהגענו למגבלת ההוצאה.";
  if (status === 429) return "יותר מדי בקשות. נסו שוב בעוד רגע.";
  if (status === 404) return "המודל לא נמצא.";
  return "הבדיחה לא הגיעה. נסו שוב.";
}

// output_text קיים רק בחלק מהתשובות, ולכן יש גם דרך גיבוי דרך מערך output.
function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text);
  return parts.join("\n").trim();
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return fail(405, "רק POST");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY is missing");
      return fail(500, "השרת לא מוגדר עדיין.");
    }

    let topic = "";
    try {
      const body = await request.json();
      if (typeof body?.topic === "string") topic = body.topic.trim().slice(0, MAX_TOPIC);
    } catch {
      // גוף שבור נחשב "אין נושא"
    }

    const model = process.env.OPENAI_MODEL || "gpt-5";
    const input = topic ? `נושא הבדיחה: ${topic}` : "אין נושא. ספר בדיחה כללית על החיים.";
    console.log(`joke: topic="${topic}" model=${model}`);

    let response;
    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          instructions: INSTRUCTIONS,
          input,
          reasoning: { effort: "low" },
          max_output_tokens: 2000,
        }),
      });
    } catch (error) {
      console.error("OpenAI network error:", error);
      return fail(502, "אין חיבור לשירות הבדיחות. נסו שוב.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = data?.error?.code ?? data?.error?.type;
      console.error(`OpenAI error ${response.status} ${code}: ${data?.error?.message}`);
      return fail(502, errorMessage(response.status, code));
    }

    const joke = extractText(data);
    if (!joke) {
      console.error(`OpenAI returned no text. status=${data.status} reason=${data.incomplete_details?.reason}`);
      return fail(502, "הבדיחה לא הגיעה. נסו שוב.");
    }

    return Response.json({ joke });
  },
};
