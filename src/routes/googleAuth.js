import express from "express";
import { google } from "googleapis";
import { pool } from "../db/index.js";

const router = express.Router();

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/v1/auth/google/callback"
  );
}

/**
 * GET /api/v1/auth/google?user_id=XXX
 * Redireciona para o consent screen do Google
 */
router.get("/auth/google", (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).send("Missing user_id");

  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: user_id, // passa o user_id pelo state do OAuth
  });

  res.redirect(url);
});

/**
 * GET /api/v1/auth/google/callback
 * Recebe o code do Google, troca por tokens e salva no banco
 */
router.get("/auth/google/callback", async (req, res) => {
  const { code, state: user_id } = req.query;

  if (!code || !user_id) return res.status(400).send("Missing code or state");

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    await pool.query(
      `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, token_expiry)
       VALUES ($1, 'google', $2, $3, $4)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, user_integrations.refresh_token),
         token_expiry = EXCLUDED.token_expiry,
         updated_at = NOW()`,
      [user_id, tokens.access_token, tokens.refresh_token, new Date(tokens.expiry_date)]
    );

    res.send(`
      <html>
        <body style="font-family:sans-serif;background:#0d0d1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1 style="font-size:48px;letter-spacing:10px">ORA</h1>
            <p style="color:#2ec4b6;font-size:18px">✓ Google Calendar conectado!</p>
            <p style="color:#555;font-size:14px">Pode fechar esta janela.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Google OAuth callback error:", err);
    res.status(500).send("Falha na autenticação. Tente novamente.");
  }
});

/**
 * GET /api/v1/auth/google/status/:user_id
 * Verifica se o usuário tem o Google Calendar conectado
 */
router.get("/auth/google/status/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM user_integrations WHERE user_id = $1 AND provider = 'google'`,
      [user_id]
    );
    res.json({ connected: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
