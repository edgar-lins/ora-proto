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
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('ORA API running 🚀');
});

const PORT = process.env.PORT || 3000;

app.use('/api/v1/device', deviceRoutes);
app.use("/api/v1/device", searchRoutes);
app.use("/api/v1/device", respondRoutes);
app.use("/api/v1/device", memoriesRoutes);
app.use("/api/v1/device", contextRoutes);
app.use("/api/v1/device", contextRetrieverRoutes);
app.use("/api/v1/device", contextBuilderRoutes);
app.use("/api/v1/device", contextResponderRoutes);
app.use("/api/v1/memory", memoryAutoRoutes);
app.use("/api/v1/device", voiceRoutes);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
