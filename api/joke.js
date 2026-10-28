// הפונקציה היחידה של האפליקציה, והמקום היחיד שקורא את המפתח של OpenAI.
// הדפדפן שולח נושא ומצב (בדיחה או טריוויה). הפונקציה מבקשת מהמודל ומחזירה רק את התוכן:
// בבדיחה { joke }, ובטריוויה { question, answer }.

const MAX_TOPIC = 100;
const MAX_AVOID = 12;
const MAX_AVOID_LENGTH = 200;

// גיוון בטריוויה: כל בקשה מקבלת זווית אקראית, ובלי נושא גם תחום אקראי.
// הבחירה האקראית נעשית בקוד ולא במודל, כי מודל שמתבקש "שאלה כללית" חוזר לאותן שאלות מוכרות.
const TRIVIA_FIELDS = [
  "היסטוריה", "גאוגרפיה", "בעלי חיים", "גוף האדם", "חלל ואסטרונומיה", "המצאות", "אוכל",
  "מוזיקה", "ספורט", "שפות ומילים", "ים ואוקיינוסים", "צמחים", "מדינת ישראל", "אמנות", "מזג אוויר",
];
const TRIVIA_ANGLES = [
  "שיא או מספר מפתיע", "מקור או היסטוריה", "אדם או ממציא", "מקום", "עובדה שרוב האנשים לא יודעים",
  "מילה או שם", "השוואה בין שני דברים", "תאריך או תקופה",
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const OPENAI_URL = "https://api.openai.com/v1/responses";

const MODES = {
  joke: {
    instructions:
      "אתה כותב בדיחות קצרות בעברית. כתוב בדיחה אחת בלבד, עד ארבעה משפטים, נקייה ומתאימה לכל גיל. בלי הקדמה, בלי הסבר ובלי אימוג׳י. רק הבדיחה.",
    input: (topic) => (topic ? `נושא הבדיחה: ${topic}` : "אין נושא. ספר בדיחה כללית על החיים."),
    missing: "הבדיחה לא הגיעה. נסו שוב.",
  },
  trivia: {
    instructions:
      "אתה כותב שאלות טריוויה בעברית. כתוב שאלה אחת על הנושא, עם תשובה אחת קצרה ונכונה עובדתית. " +
      "בחר רק עובדה שאתה בטוח בה לגמרי. אם אינך בטוח, בחר עובדה אחרת על אותו נושא. " +
      "השאלה ברורה, עם תשובה אחת בלבד, ומתאימה לכל גיל. התשובה עד שמונה מילים, ואחריה משפט קצר אחד שמסביר אותה. בלי אימוג׳י.",
    input: (topic, avoid) => {
      const lines = [
        topic ? `נושא השאלה: ${topic}` : `אין נושא. שאל שאלה בתחום: ${pick(TRIVIA_FIELDS)}.`,
        `זווית השאלה: ${pick(TRIVIA_ANGLES)}.`,
        "העדף שאלה פחות צפויה, לא את השאלה הראשונה שעולה לך על הנושא.",
      ];
      if (avoid.length) lines.push("אל תשאל אף אחת מהשאלות האלה, וגם לא שאלה דומה להן:", ...avoid.map((q) => `- ${q}`));
      return lines.join("\n");
    },
    missing: "השאלה לא הגיעה. נסו שוב.",
    // המודל מחזיר JSON במבנה קבוע, והקוד בודק אותו לפני שהוא שולח לדף
    format: {
      type: "json_schema",
      name: "trivia",
      strict: true,
      schema: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["question", "answer", "explanation"],
        additionalProperties: false,
      },
    },
  },
};

const fail = (status, error) => Response.json({ error }, { status });

// הודעה קצרה בעברית לדף, לפי הקוד שחזר מ-OpenAI. הפרטים נשארים ב-Logs.
function errorMessage(status, code, missing) {
  if (status === 401) return "המפתח של השרת לא תקין.";
  if (code === "insufficient_quota") return "נגמר הקרדיט או שהגענו למגבלת ההוצאה.";
  if (status === 429) return "יותר מדי בקשות. נסו שוב בעוד רגע.";
  if (status === 404) return "המודל לא נמצא.";
  return missing;
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

function parseTrivia(text) {
  try {
    const { question, answer, explanation } = JSON.parse(text);
    if ([question, answer, explanation].every((v) => typeof v === "string") && question.trim() && answer.trim()) {
      return { question: question.trim(), answer: answer.trim(), explanation: explanation.trim() };
    }
  } catch {
    // נופל לשגיאה למטה
  }
  return null;
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return fail(405, "רק POST");

    // מפתח של OpenAI בנוי רק מאותיות באנגלית, ספרות, - ו-_. כל תו אחר (רווח, ירידת שורה,
    // סימן כיוון נסתר מהדבקה) שובר את כותרת הבקשה, ולכן מנקים אותו.
    const apiKey = process.env.OPENAI_API_KEY?.replace(/[^A-Za-z0-9_-]/g, "");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is missing");
      return fail(500, "השרת לא מוגדר עדיין.");
    }

    let topic = "";
    let modeName = "joke";
    let avoid = [];
    try {
      const body = await request.json();
      if (typeof body?.topic === "string") topic = body.topic.trim().slice(0, MAX_TOPIC);
      if (body?.mode === "trivia") modeName = "trivia";
      // שאלות אחרונות שהדפדפן כבר הציג, כדי שהמודל לא יחזור עליהן. מוגבל בכמות ובאורך.
      if (Array.isArray(body?.avoid)) {
        avoid = body.avoid
          .filter((q) => typeof q === "string" && q.trim())
          .slice(-MAX_AVOID)
          .map((q) => q.trim().slice(0, MAX_AVOID_LENGTH));
      }
    } catch {
      // גוף שבור נחשב "אין נושא", במצב בדיחה
    }
    const mode = MODES[modeName];

    const model = process.env.OPENAI_MODEL || "gpt-5";
    console.log(`${modeName}: topic="${topic}" model=${model}`);

    let response;
    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          instructions: mode.instructions,
          input: mode.input(topic, avoid),
          reasoning: { effort: "low" },
          max_output_tokens: 2000,
          ...(mode.format && { text: { format: mode.format } }),
        }),
      });
    } catch (error) {
      // בלי error.message: בשגיאת כותרת הוא עלול לכלול את המפתח
      console.error(`OpenAI request failed: ${error.name} ${error.cause?.code ?? ""}`);
      return fail(502, "אין חיבור לשירות. נסו שוב.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = data?.error?.code ?? data?.error?.type;
      console.error(`OpenAI error ${response.status} ${code}: ${data?.error?.message}`);
      return fail(502, errorMessage(response.status, code, mode.missing));
    }

    const text = extractText(data);
    if (!text) {
      console.error(`OpenAI returned no text. status=${data.status} reason=${data.incomplete_details?.reason}`);
      return fail(502, mode.missing);
    }

    if (modeName === "joke") return Response.json({ joke: text });

    const trivia = parseTrivia(text);
    if (!trivia) {
      console.error("OpenAI trivia did not match the schema");
      return fail(502, mode.missing);
    }
    return Response.json(trivia);
  },
};
