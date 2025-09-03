import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.json());

// Variables de entorno (las pondremos en Render)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "redco123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// --- Verificación del webhook (GET) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Recepción de mensajes (POST) ---
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || !messages[0]) {
      return res.sendStatus(200);
    }

    const msg = messages[0];
    const from = msg.from;
    const userText = msg.text?.body || "";

    // Respuesta inicial por si no hay ChatGPT
    let replyText = "Gracias por escribir a REDCO 🙌 ¿En qué puedo apoyarte?";

    // Si hay clave de OpenAI, manda el mensaje a ChatGPT
    if (openai && userText) {
      const systemPrompt =
        "Eres el asistente virtual de Red Científica Odontológica (REDCO). " +
        "Responde en español, en tono cercano, profesional y empático. " +
        "Sé claro y breve; ofrece pasos concretos. " +
        "No des consejos clínicos personalizados. " +
        "Objetivo: informar y facilitar inscripción a cursos y resolver dudas.";

      const ai = await openai.responses.create({
        model: "gpt-4o",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        temperature: 0.6
      });

      replyText = (ai.output_text || replyText).trim();
    }

    // Enviar respuesta al usuario en WhatsApp
    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        type: "text",
        text: { body: replyText }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.response?.data || err.message);
    return res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`REDCO bot escuchando en puerto ${PORT}`));
