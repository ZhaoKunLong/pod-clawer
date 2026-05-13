const params = new URLSearchParams(location.search);
const selectedDate = params.get('date');

async function loadDetail() {
  const episodes = await (await fetch('/episodes')).json();
  const targetDate = selectedDate || episodes[0]?.date;
  if (!targetDate) {
    document.querySelector('#title').textContent = '暂无音频';
    return;
  }

  const episode = await (await fetch(`/episodes/${encodeURIComponent(targetDate)}`)).json();
  document.title = `${episode.date} 朝闻天下音频`;
  document.querySelector('#title').textContent = episode.title;
  document.querySelector('#date').textContent = episode.date;
  document.querySelector('#description').textContent = episode.description || '来自 CCTV 朝闻天下。';

  const cover = document.querySelector('#cover');
  if (episode.image) {
    cover.src = episode.image;
  } else {
    cover.hidden = true;
  }

  const audio = document.querySelector('#audio');
  audio.src = episode.audioUrl;
  audio.play().catch(() => {
    audio.removeAttribute('autoplay');
  });

  renderHistory(episodes, targetDate);
}

function renderHistory(episodes, targetDate) {
  const list = document.querySelector('#episode-list');
  list.replaceChildren(
    ...episodes.map((episode) => {
      const link = document.createElement('a');
      link.className = `episode-row ${episode.date === targetDate ? 'active' : ''}`;
      link.href = `/episode.html?date=${encodeURIComponent(episode.date)}`;
      link.innerHTML = `
        <span>
          <strong>${escapeHtml(episode.date)}</strong>
          <small>${escapeHtml(episode.title)}</small>
        </span>
        <b>${episode.date === targetDate ? '当前' : '播放'}</b>
      `;
      return link;
    }),
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

loadDetail().catch((error) => {
  document.querySelector('#title').textContent = error.message;
});

