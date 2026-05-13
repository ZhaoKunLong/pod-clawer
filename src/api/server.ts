import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { episodeAudioPath, listEpisodes, readMeta } from '../services/storage.js';

const app = express();
const webRoot = path.resolve('src/web');

app.use('/data', express.static(config.dataDir, { immutable: false, maxAge: '5m' }));
app.use(express.static(webRoot));

app.get('/episodes', async (_req, res, next) => {
  try {
    const episodes = await listEpisodes();
    res.json(
      episodes.map((episode) => ({
        ...episode,
        audioUrl: `/data/${episode.date}/audio.mp3`,
      })),
    );
  } catch (error) {
    next(error);
  }
});

app.get('/episodes/:date', async (req, res, next) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      return;
    }

    const meta = await readMeta(date);
    await fs.access(episodeAudioPath(date));
    res.json({
      ...meta,
      audioUrl: `/data/${date}/audio.mp3`,
    });
  } catch (error) {
    res.status(404).json({ error: 'Episode not found' });
  }
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error.message });
});

app.listen(config.port, () => {
  console.log(`pod-clawer server listening on http://localhost:${config.port}`);
});

