import express from 'express';
import bodyParser from 'body-parser';
import deviceRoutes from './routes/device.js';
import searchRoutes from "./routes/search.js";
import respondRoutes from "./routes/respond.js";
import memoriesRoutes from "./routes/memories.js";
import contextRoutes from "./routes/context.js";
import contextRetrieverRoutes from "./routes/contextRetriever.js";
import contextBuilderRoutes from "./routes/contextBuilder.js";
import contextResponderRoutes from "./routes/contextResponder.js";
import memoryAutoRoutes from "./routes/memoryAuto.js";
import voiceRoutes from "./routes/voice.js";
import speakRoutes from "./routes/speak.js";
import speakRespondRoutes from "./routes/speakRespond.js";
import speakConverse from "./routes/speakConverse.js";
import conversationContext from "./routes/conversationContext.js";
import voiceLoopRoutes from "./routes/voiceLoop.js";
import googleAuthRoutes from "./routes/googleAuth.js";
import calendarRoutes from "./routes/calendar.js";
import proactiveRoutes from "./routes/proactive.js";
import healthRoutes from "./routes/health.js";
import briefingRoutes from "./routes/briefing.js";
import goalsRoutes from "./routes/goals.js";
import transcribeRoutes from "./routes/transcribe.js";
import dotenv from 'dotenv';
import cors from "cors";
import { pool } from "./db/index.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('ORA API running 🚀');
});

const PORT = process.env.PORT || 3000;

app.use('/api/v1', googleAuthRoutes);
app.use('/api/v1', calendarRoutes);
app.use('/api/v1', proactiveRoutes);
app.use('/api/v1', healthRoutes);
app.use('/api/v1/device', briefingRoutes);
app.use('/api/v1', goalsRoutes);
app.use('/api/v1/device', transcribeRoutes);
app.use('/api/v1/device', deviceRoutes);
app.use("/api/v1/device", searchRoutes);
app.use("/api/v1/device", respondRoutes);
app.use("/api/v1", memoriesRoutes);
app.use("/api/v1/device", contextRoutes);
app.use("/api/v1/device", contextRetrieverRoutes);
app.use("/api/v1/device", contextBuilderRoutes);
app.use("/api/v1/device", contextResponderRoutes);
app.use("/api/v1/memory", memoryAutoRoutes);
app.use("/api/v1/device", voiceRoutes);
app.use("/api/v1/device", speakRoutes);
app.use("/api/v1/device", speakRespondRoutes);
app.use("/api/v1/device", speakConverse);
app.use("/api/v1", conversationContext);
app.use("/api/v1/device", voiceLoopRoutes);

async function runMigrations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT,
        summary TEXT, tags TEXT[], embedding TEXT, metadata JSONB,
        type TEXT DEFAULT 'auto', created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS conversation_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        provider TEXT NOT NULL, access_token TEXT, refresh_token TEXT,
        token_expiry TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, provider)
      );
      CREATE TABLE IF NOT EXISTS health_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        type TEXT NOT NULL, value NUMERIC, unit TEXT, notes TEXT,
        date DATE DEFAULT CURRENT_DATE, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS health_exams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        exam_type TEXT, exam_date DATE, analysis TEXT, values JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        title TEXT NOT NULL, target_description TEXT, deadline DATE,
        status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS goal_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL, date DATE NOT NULL, type TEXT NOT NULL,
        description TEXT NOT NULL, completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP, calendar_event_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS proactive_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        should_notify BOOLEAN, message TEXT, category TEXT, reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS proactive_action_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        action_type TEXT NOT NULL, ref_id TEXT, response TEXT,
        sent_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS healthkit_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
        sleep_minutes INT, resting_hr INT, hrv_ms NUMERIC(6,1),
        steps_today INT, active_calories_today INT, weight_kg NUMERIC(5,1),
        recent_workouts JSONB, synced_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
      ALTER TABLE healthkit_snapshots ALTER COLUMN hrv_ms TYPE NUMERIC(6,1);
    `);
    console.log("✅ Migrations OK");
  } catch (err) {
    console.error("❌ Migration error:", err.message);
  }
}

runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});
