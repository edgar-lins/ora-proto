import express from 'express';
import bodyParser from 'body-parser';
import deviceRoutes from './routes/device.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('ORA API running 🚀');
});

const PORT = process.env.PORT || 3000;

app.use('/api/v1/device', deviceRoutes);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
