import { google } from "googleapis";
import { pool } from "../db/index.js";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/v1/auth/google/callback"
  );
}

/**
 * Retorna os eventos do Google Calendar do usuário para hoje.
 * Retorna null se o usuário não tiver o Google conectado.
 */
export async function getTodayEvents(user_id) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expiry
     FROM user_integrations
     WHERE user_id = $1 AND provider = 'google'`,
    [user_id]
  );

  if (!rows.length) return null;

  const { access_token, refresh_token, token_expiry } = rows[0];

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined,
  });

  // Atualiza o token automaticamente se expirado
  oauth2Client.on("tokens", async (tokens) => {
    await pool.query(
      `UPDATE user_integrations SET access_token = $1, token_expiry = $2, updated_at = NOW()
       WHERE user_id = $3 AND provider = 'google'`,
      [tokens.access_token, new Date(tokens.expiry_date), user_id]
    );
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });

  const events = response.data.items || [];
  return events.map((e) => {
    const start = e.start?.dateTime || e.start?.date;
    const time = start
      ? new Date(start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "dia todo";
    return `- ${time}: ${e.summary || "Sem título"}`;
  });
}

/**
 * Retorna eventos próximos (próximas N horas) para notificações proativas.
 */
export async function getUpcomingEvents(user_id, withinMinutes = 30) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expiry
     FROM user_integrations
     WHERE user_id = $1 AND provider = 'google'`,
    [user_id]
  );

  if (!rows.length) return [];

  const { access_token, refresh_token, token_expiry } = rows[0];
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token, refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const soon = new Date(now.getTime() + withinMinutes * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: soon.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 5,
  });

  return response.data.items || [];
}

/**
 * Cria um evento no Google Calendar do usuário.
 * @param {string} user_id
 * @param {string} title
 * @param {string} date  - formato YYYY-MM-DD
 * @param {string} time  - formato HH:MM
 * @param {number} duration_minutes
 */
export async function createCalendarEvent(user_id, { title, date, time, duration_minutes = 60 }) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expiry
     FROM user_integrations
     WHERE user_id = $1 AND provider = 'google'`,
    [user_id]
  );

  if (!rows.length) throw new Error("Google Calendar não conectado");

  const { access_token, refresh_token, token_expiry } = rows[0];
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    await pool.query(
      `UPDATE user_integrations SET access_token = $1, token_expiry = $2, updated_at = NOW()
       WHERE user_id = $3 AND provider = 'google'`,
      [tokens.access_token, new Date(tokens.expiry_date), user_id]
    );
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const start = new Date(`${date}T${time}:00`);
  const end   = new Date(start.getTime() + duration_minutes * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
      end:   { dateTime: end.toISOString(),   timeZone: "America/Sao_Paulo" },
    },
  });

  return {
    id: event.data.id,
    title,
    date,
    time,
    duration_minutes,
    htmlLink: event.data.htmlLink,
  };
}

/**
 * Deleta um evento do Google Calendar pelo ID.
 */
export async function deleteCalendarEvent(user_id, event_id) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expiry
     FROM user_integrations WHERE user_id = $1 AND provider = 'google'`,
    [user_id]
  );
  if (!rows.length) throw new Error("Google Calendar não conectado");

  const { access_token, refresh_token, token_expiry } = rows[0];
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token, refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined });

  oauth2Client.on("tokens", async (tokens) => {
    await pool.query(
      `UPDATE user_integrations SET access_token = $1, token_expiry = $2, updated_at = NOW()
       WHERE user_id = $3 AND provider = 'google'`,
      [tokens.access_token, new Date(tokens.expiry_date), user_id]
    );
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  await calendar.events.delete({ calendarId: "primary", eventId: event_id });
}

/**
 * Lista eventos em um intervalo de datas (retorna id, title, start, end).
 */
export async function getEventsForRange(user_id, dateFrom, dateTo) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expiry
     FROM user_integrations WHERE user_id = $1 AND provider = 'google'`,
    [user_id]
  );
  if (!rows.length) return null;

  const { access_token, refresh_token, token_expiry } = rows[0];
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token, refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined });

  oauth2Client.on("tokens", async (tokens) => {
    await pool.query(
      `UPDATE user_integrations SET access_token = $1, token_expiry = $2, updated_at = NOW()
       WHERE user_id = $3 AND provider = 'google'`,
      [tokens.access_token, new Date(tokens.expiry_date), user_id]
    );
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const start = new Date(`${dateFrom}T00:00:00`);
  const end   = new Date(`${dateTo}T23:59:59`);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (response.data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || "Sem título",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
  }));
}
