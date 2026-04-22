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
import transcribeRoutes from "./routes/transcribe.js";
import dotenv from 'dotenv';
import cors from "cors";

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
