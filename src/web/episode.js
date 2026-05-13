const params = new URLSearchParams(location.search);
const selectedDate = params.get('date');
const currentProgramId = params.get('program') || 'zwtx';

function buildIndexUrl(programId) {
  return `./data/${programId}/index.json`;
}

function buildMetaUrl(programId, date) {
  return `./data/${programId}/${encodeURIComponent(date)}/meta.json`;
}

function buildEpisodeUrl(programId, date) {
  return `./episode.html?program=${encodeURIComponent(programId)}&date=${encodeURIComponent(date)}`;
}

async function loadDetail() {
  // Update back link to preserve program context
  const backLink = document.querySelector('#back-link');
  if (backLink) {
    backLink.href = `./?program=${encodeURIComponent(currentProgramId)}`;
  }

  const episodes = await fetchJson(buildIndexUrl(currentProgramId));
  const targetDate = selectedDate || episodes[0]?.date;
  if (!targetDate) {
    document.querySelector('#title').textContent = '暂无节目';
    return;
  }

  const episode = await fetchJson(buildMetaUrl(currentProgramId, targetDate));
  document.title = `${episode.date} ${episode.program || currentProgramId}`;
  document.querySelector('#title').textContent = episode.title;
  document.querySelector('#date').textContent = `${episode.date} · ${episode.type.toUpperCase()}${episode.fallback ? ' · FALLBACK' : ''}`;
  document.querySelector('#description').textContent = episode.description || `来自 CCTV ${episode.title}。`;

  const cover = document.querySelector('#cover');
  if (episode.image) {
    cover.src = episode.image;
    cover.hidden = false;
  } else {
    cover.hidden = true;
  }

  await attachPlayer(episode);
  renderHistory(episodes, targetDate);
}

async function attachPlayer(episode) {
  const media = document.querySelector('#media');
  const sourceUrl = episode.fallback ? relativeFallbackUrl(episode) : episode.streamUrl;
  if (!sourceUrl) {
    throw new Error('缺少可播放音源');
  }

  if (episode.type === 'm3u8') {
    media.outerHTML = '<video id="media" class="player" controls playsinline autoplay preload="metadata"></video>';
    const player = document.querySelector('#media');
    if (player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = sourceUrl;
      await player.play().catch(() => {});
      return;
    }

    const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.mjs');
    if (!Hls.isSupported()) {
      throw new Error('当前浏览器不支持 HLS 播放');
    }

    const hls = new Hls();
    hls.loadSource(sourceUrl);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void player.play().catch(() => {});
    });
    return;
  }

  media.outerHTML = '<audio id="media" class="player" controls autoplay preload="metadata"></audio>';
  const player = document.querySelector('#media');
  player.src = sourceUrl;
  await player.play().catch(() => {});
}

function relativeFallbackUrl(episode) {
  if (!episode.audioPath) return '';
  return `./data/${episode.audioPath}`;
}

function renderHistory(episodes, targetDate) {
  const list = document.querySelector('#episode-list');
  list.replaceChildren(
    ...episodes.map((episode) => {
      const link = document.createElement('a');
      link.className = `episode-row ${episode.date === targetDate ? 'active' : ''}`;
      link.href = buildEpisodeUrl(currentProgramId, episode.date);
      link.innerHTML = `
        <span>
          <strong>${escapeHtml(episode.date)}</strong>
          <small>${escapeHtml(episode.title)}</small>
        </span>
        <b>${episode.date === targetDate ? '当前' : episode.type.toUpperCase()}</b>
      `;
      return link;
    }),
  );
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`读取失败: ${url}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

loadDetail().catch((error) => {
  document.querySelector('#title').textContent = error.message;
});
