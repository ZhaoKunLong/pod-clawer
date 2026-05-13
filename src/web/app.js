const DATA_INDEX_URL = './data/index.json';

async function loadEpisodes() {
  const list = document.querySelector('#episode-list');
  list.textContent = '加载中...';

  const response = await fetch(DATA_INDEX_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`无法读取 ${DATA_INDEX_URL}`);
  }

  const episodes = await response.json();
  if (!episodes.length) {
    list.textContent = '暂无可播放节目。';
    return;
  }

  list.replaceChildren(
    ...episodes.map((episode, index) => {
      const link = document.createElement('a');
      link.className = 'episode-row';
      link.href = `./episode.html?date=${encodeURIComponent(episode.date)}`;
      link.innerHTML = `
        <span>
          <strong>${escapeHtml(episode.date)}</strong>
          <small>${escapeHtml(episode.title)}</small>
        </span>
        <b>${index === 0 ? '最新' : episode.type.toUpperCase()}</b>
      `;
      return link;
    }),
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

loadEpisodes().catch((error) => {
  document.querySelector('#episode-list').textContent = error.message;
});
